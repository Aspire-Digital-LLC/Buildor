use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};

// --- Mailbox (file-backed, in-memory cached) ---

static MAILBOX: std::sync::OnceLock<Mutex<HashMap<String, MailboxEntryData>>> = std::sync::OnceLock::new();
static PENDING_SPAWNS: std::sync::OnceLock<Mutex<Vec<PendingSpawn>>> = std::sync::OnceLock::new();

fn get_mailbox() -> &'static Mutex<HashMap<String, MailboxEntryData>> {
    MAILBOX.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_pending() -> &'static Mutex<Vec<PendingSpawn>> {
    PENDING_SPAWNS.get_or_init(|| Mutex::new(Vec::new()))
}

fn mailbox_dir() -> Result<PathBuf, String> {
    let base = dirs_next::data_dir()
        .ok_or_else(|| "Cannot resolve app data directory".to_string())?;
    let dir = base.join("Buildor").join("agent-results");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create mailbox dir: {}", e))?;
    }
    Ok(dir)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MailboxEntryData {
    pub session_id: String,
    pub name: String,
    pub parent_session_id: Option<String>,
    pub status: String,           // "completed" | "failed"
    pub health_state: String,     // "healthy" | "idle" | "stalling" | "looping" | "erroring" | "distressed"
    pub started_at: String,
    pub ended_at: String,
    pub output: Option<String>,
    pub output_path: Option<String>,
    pub return_mode: String,
    pub duration_ms: i64,
    pub model: Option<String>,
    pub exit_reason: Option<String>, // "natural" | "killed" | "takeover" | null
}

#[derive(Debug, Clone)]
struct PendingSpawn {
    working_dir: String,
    prompt: String,
    name: String,
    parent_session_id: Option<String>,
    return_to: Option<String>,
    source_skill: Option<String>,
    model: Option<String>,
    return_mode: String,
    output_path: Option<String>,
    dependencies: Vec<String>,
    queued_at: String,
}

// --- Internal helpers ---

/// Persist a result to disk and cache. Called internally by agents.rs on agent exit.
pub fn deposit_result_internal(app: &AppHandle, entry: MailboxEntryData) -> Result<(), String> {
    // Write to disk
    let dir = mailbox_dir()?;
    let path = dir.join(format!("{}.json", &entry.session_id));
    let json = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize mailbox entry: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write mailbox entry: {}", e))?;

    // Insert into cache
    {
        let mb = get_mailbox();
        let mut map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;
        map.insert(entry.session_id.clone(), entry.clone());
    }

    // Emit event
    let _ = app.emit("buildor-event", serde_json::json!({
        "type": "agent-result-deposited",
        "data": {
            "sessionId": &entry.session_id,
            "name": &entry.name,
            "parentSessionId": &entry.parent_session_id,
            "status": &entry.status,
        }
    }));

    // Telemetry: deposit event
    if crate::telemetry::has_subscribers() {
        let msg = format!(
            "[TELEMETRY:mailbox] deposit agent=\"{}\" parent={} status={} mailbox={}",
            &entry.name,
            entry.parent_session_id.as_deref().unwrap_or("none"),
            &entry.status,
            get_mailbox().lock().map(|m| m.len()).unwrap_or(0),
        );
        for sid in crate::telemetry::get_mailbox_subscribers() {
            let msg_clone = msg.clone();
            let sid_clone = sid.clone();
            tauri::async_runtime::spawn(async move {
                let _ = super::claude::send_message(sid_clone, msg_clone).await;
            });
        }
    }

    // Check if any pending spawns can now proceed
    check_pending_spawns(app);

    Ok(())
}

/// Check if a dependency is satisfied (by sessionId or by agent name within parent scope).
fn resolve_dependency(dep: &str, parent_session_id: Option<&str>) -> bool {
    let mb = get_mailbox();
    let map = match mb.lock() {
        Ok(m) => m,
        Err(_) => return false,
    };

    // Try by sessionId first
    if map.contains_key(dep) {
        return true;
    }

    // Try by agent name, scoped to same parent
    for entry in map.values() {
        if entry.name == dep {
            if let Some(parent) = parent_session_id {
                if entry.parent_session_id.as_deref() == Some(parent) {
                    return true;
                }
            } else {
                return true;
            }
        }
    }

    false
}

/// Get a result by dependency identifier (sessionId or name within parent scope).
fn get_dependency_result(dep: &str, parent_session_id: Option<&str>) -> Option<MailboxEntryData> {
    let mb = get_mailbox();
    let map = match mb.lock() {
        Ok(m) => m,
        Err(_) => return None,
    };

    // Try by sessionId first
    if let Some(entry) = map.get(dep) {
        return Some(entry.clone());
    }

    // Try by agent name, scoped to same parent
    for entry in map.values() {
        if entry.name == dep {
            if let Some(parent) = parent_session_id {
                if entry.parent_session_id.as_deref() == Some(parent) {
                    return Some(entry.clone());
                }
            } else {
                return Some(entry.clone());
            }
        }
    }

    None
}

/// Check if any dependency agent has failed (meaning the pending spawn should be abandoned).
fn has_failed_dependency(deps: &[String], parent_session_id: Option<&str>) -> Option<String> {
    let mb = get_mailbox();
    let map = match mb.lock() {
        Ok(m) => m,
        Err(_) => return None,
    };

    for dep in deps {
        // Check by sessionId
        if let Some(entry) = map.get(dep.as_str()) {
            if entry.status == "failed" {
                return Some(dep.clone());
            }
            continue;
        }
        // Check by name within parent
        for entry in map.values() {
            if entry.name == *dep {
                let matches_parent = match parent_session_id {
                    Some(p) => entry.parent_session_id.as_deref() == Some(p),
                    None => true,
                };
                if matches_parent && entry.status == "failed" {
                    return Some(dep.clone());
                }
            }
        }
    }
    None
}

/// Process pending spawns whose dependencies are now met.
fn check_pending_spawns(app: &AppHandle) {
    let pending = get_pending();
    let mut queue = match pending.lock() {
        Ok(q) => q,
        Err(_) => return,
    };

    let mut ready_indices = Vec::new();
    let mut failed_indices = Vec::new();

    for (i, ps) in queue.iter().enumerate() {
        // Check for failed dependencies first
        if let Some(failed_dep) = has_failed_dependency(&ps.dependencies, ps.parent_session_id.as_deref()) {
            eprintln!("Pending agent \"{}\" abandoned: dependency \"{}\" failed", ps.name, failed_dep);
            let _ = app.emit("buildor-event", serde_json::json!({
                "type": "agent-dependency-failed",
                "data": {
                    "agentName": &ps.name,
                    "failedDependency": &failed_dep,
                    "parentSessionId": &ps.parent_session_id,
                }
            }));
            // Telemetry: abandoned event
            if crate::telemetry::has_subscribers() {
                let msg = format!(
                    "[TELEMETRY:mailbox] abandoned agent=\"{}\" failed-dep=\"{}\" pending={}",
                    ps.name, failed_dep, queue.len(),
                );
                for sid in crate::telemetry::get_mailbox_subscribers() {
                    let msg_clone = msg.clone();
                    let sid_clone = sid.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = super::claude::send_message(sid_clone, msg_clone).await;
                    });
                }
            }
            failed_indices.push(i);
            continue;
        }

        let all_met = ps.dependencies.iter().all(|dep| {
            resolve_dependency(dep, ps.parent_session_id.as_deref())
        });
        if all_met {
            ready_indices.push(i);
        }
    }

    // Remove failed + ready (reverse order to preserve indices)
    let mut to_remove: Vec<usize> = failed_indices.iter().chain(ready_indices.iter()).cloned().collect();
    to_remove.sort_unstable();
    to_remove.dedup();

    let mut to_spawn: Vec<PendingSpawn> = Vec::new();
    for &i in to_remove.iter().rev() {
        let ps = queue.remove(i);
        if ready_indices.contains(&i) {
            to_spawn.push(ps);
        }
    }

    // Drop the lock before spawning (spawn_agent takes its own locks)
    drop(queue);

    // Spawn ready agents with dependency context injected
    for ps in to_spawn {
        // Build dependency context from results
        let mut dep_context = String::new();
        for dep in &ps.dependencies {
            if let Some(result) = get_dependency_result(dep, ps.parent_session_id.as_deref()) {
                dep_context.push_str(&format!(
                    "\n--- Result from agent \"{}\" (status: {}) ---\n{}\n---\n",
                    result.name,
                    result.status,
                    result.output.as_deref().unwrap_or("(no output)"),
                ));
            }
        }

        let augmented_prompt = if dep_context.is_empty() {
            ps.prompt.clone()
        } else {
            format!(
                "You have access to results from prerequisite agents:\n{}\n\nYour task:\n{}",
                dep_context, ps.prompt
            )
        };

        // Telemetry: deps-met event
        if crate::telemetry::has_subscribers() {
            let pending_count = get_pending().lock().map(|q| q.len()).unwrap_or(0);
            let msg = format!(
                "[TELEMETRY:mailbox] deps-met agent=\"{}\" spawning deps=[{}] pending={}",
                ps.name,
                ps.dependencies.join(","),
                pending_count,
            );
            for sid in crate::telemetry::get_mailbox_subscribers() {
                let msg_clone = msg.clone();
                let sid_clone = sid.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = super::claude::send_message(sid_clone, msg_clone).await;
                });
            }
        }

        let app_clone = app.clone();
        let name = ps.name.clone();
        let parent = ps.parent_session_id.clone();

        // Spawn in a background thread to avoid blocking
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();
            if let Ok(rt) = rt {
                let result = rt.block_on(super::agents::spawn_agent(
                    app_clone.clone(),
                    ps.working_dir,
                    augmented_prompt,
                    name.clone(),
                    parent.clone(),
                    ps.return_to,
                    ps.source_skill,
                    ps.model,
                    Some(ps.return_mode),
                    ps.output_path,
                ));
                match result {
                    Ok(sid) => {
                        let _ = app_clone.emit("buildor-event", serde_json::json!({
                            "type": "agent-dependency-resolved",
                            "data": {
                                "agentSessionId": &sid,
                                "agentName": &name,
                                "parentSessionId": &parent,
                            }
                        }));
                    }
                    Err(e) => {
                        eprintln!("Failed to spawn pending agent \"{}\": {}", name, e);
                    }
                }
            }
        });
    }
}

// --- Tauri Commands ---

/// Deposit a result into the mailbox (called externally or for testing).
#[tauri::command]
pub async fn deposit_result(
    app: AppHandle,
    session_id: String,
    name: String,
    parent_session_id: Option<String>,
    status: String,
    health_state: Option<String>,
    started_at: String,
    ended_at: String,
    output: Option<String>,
    output_path: Option<String>,
    return_mode: Option<String>,
    duration_ms: Option<i64>,
    model: Option<String>,
    exit_reason: Option<String>,
) -> Result<(), String> {
    let entry = MailboxEntryData {
        session_id,
        name,
        parent_session_id,
        status,
        health_state: health_state.unwrap_or_else(|| "healthy".to_string()),
        started_at,
        ended_at,
        output,
        output_path,
        return_mode: return_mode.unwrap_or_else(|| "summary".to_string()),
        duration_ms: duration_ms.unwrap_or(0),
        model,
        exit_reason,
    };
    deposit_result_internal(&app, entry)
}

/// Query a single result by sessionId.
#[tauri::command]
pub async fn query_result(session_id: String) -> Result<Option<MailboxEntryData>, String> {
    let mb = get_mailbox();
    let map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;

    if let Some(entry) = map.get(&session_id) {
        return Ok(Some(entry.clone()));
    }

    // Fallback: try disk
    drop(map);
    let dir = mailbox_dir()?;
    let path = dir.join(format!("{}.json", &session_id));
    if path.exists() {
        let data = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read mailbox entry: {}", e))?;
        let entry: MailboxEntryData = serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse mailbox entry: {}", e))?;
        // Populate cache
        let mb = get_mailbox();
        let mut map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;
        map.insert(session_id, entry.clone());
        return Ok(Some(entry));
    }

    Ok(None)
}

/// Query all results for a parent session.
#[tauri::command]
pub async fn query_results_by_parent(parent_session_id: String) -> Result<Vec<MailboxEntryData>, String> {
    // Ensure cache is populated from disk
    load_from_disk_if_needed()?;

    let mb = get_mailbox();
    let map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;
    let results: Vec<MailboxEntryData> = map.values()
        .filter(|e| e.parent_session_id.as_deref() == Some(&parent_session_id))
        .cloned()
        .collect();
    Ok(results)
}

/// Query a result by agent name, optionally scoped to a parent.
#[tauri::command]
pub async fn query_result_by_name(
    name: String,
    parent_session_id: Option<String>,
) -> Result<Option<MailboxEntryData>, String> {
    load_from_disk_if_needed()?;

    let mb = get_mailbox();
    let map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;
    for entry in map.values() {
        if entry.name == name {
            if let Some(ref parent) = parent_session_id {
                if entry.parent_session_id.as_deref() == Some(parent.as_str()) {
                    return Ok(Some(entry.clone()));
                }
            } else {
                return Ok(Some(entry.clone()));
            }
        }
    }
    Ok(None)
}

/// Update the draft output for a running agent without changing status.
/// Called periodically by the frontend to persist incremental work.
#[tauri::command]
pub async fn update_agent_draft(
    session_id: String,
    output: String,
) -> Result<(), String> {
    let mb = get_mailbox();
    let mut map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;

    if let Some(entry) = map.get_mut(&session_id) {
        entry.output = Some(output.clone());
        // Write updated entry to disk
        let dir = mailbox_dir()?;
        let path = dir.join(format!("{}.json", &session_id));
        let json = serde_json::to_string_pretty(entry)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write: {}", e))?;
    } else {
        // No entry yet — create a draft entry with status "running"
        let entry = MailboxEntryData {
            session_id: session_id.clone(),
            name: String::new(), // Will be filled by agent pool lookup
            parent_session_id: None,
            status: "running".to_string(),
            health_state: "healthy".to_string(),
            started_at: chrono::Utc::now().to_rfc3339(),
            ended_at: String::new(),
            output: Some(output),
            output_path: None,
            return_mode: "summary".to_string(),
            duration_ms: 0,
            model: None,
            exit_reason: None,
        };
        // Try to fill name/parent from agent pool
        let pool = super::agents::get_pool();
        if let Ok(pool_map) = pool.lock() {
            if let Some(pool_entry) = pool_map.get(&session_id) {
                let mut e = entry.clone();
                e.name = pool_entry.name.clone();
                e.parent_session_id = pool_entry.parent_session_id.clone();
                e.started_at = pool_entry.started_at.clone();
                e.model = pool_entry.model.clone();
                map.insert(session_id.clone(), e.clone());
                let dir = mailbox_dir()?;
                let path = dir.join(format!("{}.json", &session_id));
                let json = serde_json::to_string_pretty(&e)
                    .map_err(|e| format!("Failed to serialize: {}", e))?;
                std::fs::write(&path, json)
                    .map_err(|e| format!("Failed to write: {}", e))?;
                return Ok(());
            }
        }
        map.insert(session_id.clone(), entry.clone());
        let dir = mailbox_dir()?;
        let path = dir.join(format!("{}.json", &session_id));
        let json = serde_json::to_string_pretty(&entry)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write: {}", e))?;
    }
    Ok(())
}

/// Delete all results for a parent session (disk + cache).
#[tauri::command]
pub async fn purge_results(parent_session_id: String) -> Result<u32, String> {
    let mb = get_mailbox();
    let mut map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;

    let to_remove: Vec<String> = map.values()
        .filter(|e| e.parent_session_id.as_deref() == Some(&parent_session_id))
        .map(|e| e.session_id.clone())
        .collect();

    let count = to_remove.len() as u32;
    let dir = mailbox_dir()?;

    for sid in &to_remove {
        map.remove(sid);
        let path = dir.join(format!("{}.json", sid));
        let _ = std::fs::remove_file(path);
    }

    // Also remove any pending spawns for this parent
    let pending = get_pending();
    if let Ok(mut queue) = pending.lock() {
        queue.retain(|ps| ps.parent_session_id.as_deref() != Some(&parent_session_id));
    }

    Ok(count)
}

/// Spawn an agent with dependencies. Returns sessionId if spawned immediately,
/// or "pending" if queued waiting for dependencies.
#[tauri::command]
pub async fn spawn_agent_with_deps(
    app: AppHandle,
    working_dir: String,
    prompt: String,
    name: String,
    parent_session_id: Option<String>,
    return_to: Option<String>,
    source_skill: Option<String>,
    model: Option<String>,
    return_mode: Option<String>,
    output_path: Option<String>,
    dependencies: Vec<String>,
) -> Result<String, String> {
    let return_mode = return_mode.unwrap_or_else(|| "summary".to_string());

    // Check if all dependencies are already satisfied
    let all_met = dependencies.iter().all(|dep| {
        resolve_dependency(dep, parent_session_id.as_deref())
    });

    // Check for failed dependencies
    if let Some(failed) = has_failed_dependency(&dependencies, parent_session_id.as_deref()) {
        return Err(format!("Dependency \"{}\" has failed — cannot spawn agent \"{}\"", failed, name));
    }

    if all_met {
        // Build dependency context
        let mut dep_context = String::new();
        for dep in &dependencies {
            if let Some(result) = get_dependency_result(dep, parent_session_id.as_deref()) {
                dep_context.push_str(&format!(
                    "\n--- Result from agent \"{}\" (status: {}) ---\n{}\n---\n",
                    result.name,
                    result.status,
                    result.output.as_deref().unwrap_or("(no output)"),
                ));
            }
        }

        let augmented_prompt = if dep_context.is_empty() {
            prompt
        } else {
            format!(
                "You have access to results from prerequisite agents:\n{}\n\nYour task:\n{}",
                dep_context, prompt
            )
        };

        // Spawn immediately
        let sid = super::agents::spawn_agent(
            app, working_dir, augmented_prompt, name, parent_session_id,
            return_to, source_skill, model, Some(return_mode), output_path,
        ).await?;
        Ok(sid)
    } else {
        // Enqueue
        let pending = get_pending();
        let mut queue = pending.lock().map_err(|e| format!("Pending lock error: {}", e))?;
        queue.push(PendingSpawn {
            working_dir,
            prompt,
            name: name.clone(),
            parent_session_id,
            return_to,
            source_skill,
            model,
            return_mode,
            output_path,
            dependencies,
            queued_at: chrono::Utc::now().to_rfc3339(),
        });

        let _ = app.emit("buildor-event", serde_json::json!({
            "type": "agent-dependency-waiting",
            "data": {
                "agentName": &name,
            }
        }));

        Ok("pending".to_string())
    }
}

/// Load all results from disk into cache (idempotent).
fn load_from_disk_if_needed() -> Result<(), String> {
    let dir = mailbox_dir()?;
    let mb = get_mailbox();
    let mut map = mb.lock().map_err(|e| format!("Mailbox lock error: {}", e))?;

    // Only load if cache is empty (cold start)
    if !map.is_empty() {
        return Ok(());
    }

    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read mailbox dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(mbe) = serde_json::from_str::<MailboxEntryData>(&data) {
                    map.insert(mbe.session_id.clone(), mbe);
                }
            }
        }
    }
    Ok(())
}
