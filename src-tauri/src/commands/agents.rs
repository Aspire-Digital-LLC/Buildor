use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};

// --- Agent Pool (in-memory, flat) ---

static AGENT_POOL: std::sync::OnceLock<Mutex<HashMap<String, AgentPoolEntryData>>> = std::sync::OnceLock::new();

pub fn get_pool() -> &'static Mutex<HashMap<String, AgentPoolEntryData>> {
    AGENT_POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentPoolEntryData {
    pub session_id: String,
    pub name: String,
    pub parent_session_id: Option<String>,
    pub return_to: Option<String>,
    pub source_skill: Option<String>,
    pub agent_source: String,    // "buildor" | "native"
    pub status: String,          // "running" | "completed" | "failed"
    pub health_state: String,    // "healthy" | "idle" | "stalling" | "looping" | "erroring" | "distressed"
    pub started_at: String,
    pub ended_at: Option<String>,
    pub model: Option<String>,
    pub return_mode: String,     // "summary" | "file" | "both"
    pub output_path: Option<String>,
    pub prompt: Option<String>,
    pub pid: Option<u32>,
}

#[tauri::command]
pub async fn spawn_agent(
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
) -> Result<String, String> {
    let return_mode = return_mode.unwrap_or_else(|| "summary".to_string());

    // Resolve working directory: use provided value, or inherit from parent session
    let resolved_dir = if working_dir.is_empty() {
        parent_session_id.as_deref()
            .and_then(super::claude::get_session_working_dir)
            .ok_or_else(|| "No working directory provided and no parent session to inherit from".to_string())?
    } else {
        working_dir
    };

    // Build agent system prompt
    let agent_system_prompt = format!(
        "You are a Buildor agent named \"{name}\". You were spawned by the parent session to complete a specific task.\n\
        Your task: {prompt}\n\n\
        Rules:\n\
        - Focus exclusively on the task described above.\n\
        - When you are done, output your findings/results clearly.\n\
        - Do not ask the user questions — complete the task autonomously.\n\
        - You cannot spawn sub-agents via native Claude Code mechanisms (the Agent tool is disabled).\n\
        - You MUST order sub-agents via the Buildor marker protocol: -<*{{ \"action\": \"spawn_agent\", \"name\": \"agent-name\", \"prompt\": \"task\" }}*>-\n\
        - You may declare dependencies on other agents: -<*{{ \"action\": \"spawn_agent\", \"name\": \"agent-name\", \"prompt\": \"task\", \"dependencies\": [\"other-agent-name\"] }}*>-",
    );

    let sdk_resp = crate::sdk_client::create_session(
        &resolved_dir,
        model.as_deref().unwrap_or("sonnet"),
        &agent_system_prompt,
        "dontAsk",
        // Agents are autonomous — pre-approve all dev tools via allowedTools.
        // The SDK auto-approves these; anything not listed is denied (dontAsk mode).
        vec![
            "Read".to_string(), "Edit".to_string(), "Write".to_string(),
            "Bash".to_string(), "Grep".to_string(), "Glob".to_string(),
            "WebSearch".to_string(), "WebFetch".to_string(),
            "TodoWrite".to_string(), "ToolSearch".to_string(),
        ],
        vec!["Agent".to_string()],  // Keep native Agent tool disabled — use marker protocol
        vec!["project".to_string()],  // Load CLAUDE.md but not local settings
    ).await?;

    let agent_session_id = uuid::Uuid::new_v4().to_string();

    // Start SSE bridge to forward events to frontend
    crate::sdk_sse::connect_sse_bridge(app.clone(), sdk_resp.session_id.clone(), agent_session_id.clone());

    // Register session in the shared sessions map
    super::claude::insert_session(agent_session_id.clone(), super::claude::ClaudeSession {
        sdk_session_id: sdk_resp.session_id,
        working_dir: resolved_dir.clone(),
        pid: sdk_resp.pid,
        model: model.clone(),
        system_prompt: Some(agent_system_prompt.clone()),
    });

    // Register in pool
    let entry = AgentPoolEntryData {
        session_id: agent_session_id.clone(),
        name: name.clone(),
        parent_session_id: parent_session_id.clone(),
        return_to: return_to.clone(),
        source_skill: source_skill.clone(),
        agent_source: "buildor".to_string(),
        status: "running".to_string(),
        health_state: "healthy".to_string(),
        started_at: chrono::Utc::now().to_rfc3339(),
        ended_at: None,
        model: model.clone(),
        return_mode: return_mode.clone(),
        output_path: output_path.clone(),
        prompt: Some(prompt.clone()),
        pid: sdk_resp.pid,
    };

    {
        let pool = get_pool();
        let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
        map.insert(agent_session_id.clone(), entry);
    }

    // Emit agent-spawned event
    let _ = app.emit("buildor-event", serde_json::json!({
        "type": "agent-spawned",
        "data": {
            "agentSessionId": &agent_session_id,
            "name": &name,
            "parentSessionId": &parent_session_id,
            "sourceSkill": &source_skill,
        }
    }));

    // NOTE: Do NOT send the initial prompt here. There is a race condition:
    // the frontend needs to set up its output listeners before any messages are
    // sent, otherwise Claude's output events fire before anyone is listening.
    // The frontend sends the initial prompt after listeners are ready.

    Ok(agent_session_id)
}

#[tauri::command]
pub async fn kill_agent(
    app: AppHandle,
    session_id: String,
    mark_completed: Option<bool>,
) -> Result<(), String> {
    let completed = mark_completed.unwrap_or(false);
    let now = chrono::Utc::now().to_rfc3339();

    // Capture pool entry before updating, then update
    let pool_entry = {
        let pool = get_pool();
        let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
        if let Some(entry) = map.get_mut(&session_id) {
            entry.status = if completed { "completed".to_string() } else { "failed".to_string() };
            entry.ended_at = Some(now.clone());
            Some(entry.clone())
        } else {
            None
        }
    };

    // Stop the underlying Claude session
    super::claude::stop_session(session_id.clone()).await?;

    // Deposit into mailbox so dependency resolution works
    if let Some(ref entry) = pool_entry {
        let duration_ms = chrono::DateTime::parse_from_rfc3339(&now)
            .ok()
            .and_then(|end| {
                chrono::DateTime::parse_from_rfc3339(&entry.started_at)
                    .ok()
                    .map(|start| (end - start).num_milliseconds())
            })
            .unwrap_or(0);

        let mailbox_entry = super::mailbox::MailboxEntryData {
            session_id: entry.session_id.clone(),
            name: entry.name.clone(),
            parent_session_id: entry.parent_session_id.clone(),
            status: entry.status.clone(),
            health_state: entry.health_state.clone(),
            started_at: entry.started_at.clone(),
            ended_at: now.clone(),
            output: None,
            output_path: entry.output_path.clone(),
            return_mode: entry.return_mode.clone(),
            duration_ms,
            model: entry.model.clone(),
            exit_reason: Some("killed".to_string()),
        };
        let _ = super::mailbox::deposit_result_internal(&app, mailbox_entry);
    }

    // Emit event
    let event_type = if completed { "agent-completed" } else { "agent-failed" };
    let _ = app.emit("buildor-event", serde_json::json!({
        "type": event_type,
        "data": {
            "agentSessionId": &session_id,
        }
    }));

    Ok(())
}

/// Reset health timers for a running agent (extends its grace period).
/// The actual timer reset happens on the frontend AgentHealthMonitor —
/// this command updates the pool entry's health_state back to "healthy"
/// and emits an event so the frontend monitor can reset its timers.
#[tauri::command]
pub async fn extend_agent(
    app: AppHandle,
    session_id: String,
    _seconds: Option<u32>,
) -> Result<(), String> {
    let pool = get_pool();
    let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    let entry = map.get_mut(&session_id)
        .ok_or_else(|| format!("Agent not found: {}", session_id))?;

    if entry.status != "running" {
        return Err(format!("Agent {} is not running (status: {})", session_id, entry.status));
    }

    let previous_state = entry.health_state.clone();
    entry.health_state = "healthy".to_string();

    let _ = app.emit("buildor-event", serde_json::json!({
        "type": "agent-health-changed",
        "data": {
            "agentSessionId": &session_id,
            "previousState": &previous_state,
            "newState": "healthy",
            "details": "Extended by parent/user",
        }
    }));

    Ok(())
}

/// Sync a health state transition from the frontend AgentHealthMonitor to the backend pool.
/// Called on every state transition so the pool entry reflects the real health state.
#[tauri::command]
pub async fn update_agent_health(
    session_id: String,
    health_state: String,
) -> Result<(), String> {
    let pool = get_pool();
    let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    if let Some(entry) = map.get_mut(&session_id) {
        if entry.status == "running" {
            entry.health_state = health_state;
        }
    }
    Ok(())
}

/// Kill an agent and generate a summary of its work so far.
/// The summary is injected into the parent session (if any).
#[tauri::command]
pub async fn takeover_agent(
    app: AppHandle,
    session_id: String,
) -> Result<Option<AgentPoolEntryData>, String> {
    // Capture agent info before killing
    let agent_info = {
        let pool = get_pool();
        let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
        map.get(&session_id).cloned()
    };

    let agent = agent_info.ok_or_else(|| format!("Agent not found: {}", session_id))?;

    // Update pool status
    let now = chrono::Utc::now().to_rfc3339();
    {
        let pool = get_pool();
        let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
        if let Some(entry) = map.get_mut(&session_id) {
            entry.status = "failed".to_string();
            entry.health_state = "distressed".to_string();
            entry.ended_at = Some(now.clone());
        }
    }

    // Stop the Claude session
    let _ = super::claude::stop_session(session_id.clone()).await;

    // Deposit into mailbox so dependency resolution detects the failure
    let duration_ms = chrono::DateTime::parse_from_rfc3339(&now)
        .ok()
        .and_then(|end| {
            chrono::DateTime::parse_from_rfc3339(&agent.started_at)
                .ok()
                .map(|start| (end - start).num_milliseconds())
        })
        .unwrap_or(0);

    let mailbox_entry = super::mailbox::MailboxEntryData {
        session_id: agent.session_id.clone(),
        name: agent.name.clone(),
        parent_session_id: agent.parent_session_id.clone(),
        status: "failed".to_string(),
        health_state: "distressed".to_string(),
        started_at: agent.started_at.clone(),
        ended_at: now,
        output: None,
        output_path: agent.output_path.clone(),
        return_mode: agent.return_mode.clone(),
        duration_ms,
        model: agent.model.clone(),
        exit_reason: Some("takeover".to_string()),
    };
    let _ = super::mailbox::deposit_result_internal(&app, mailbox_entry);

    // Emit agent-failed event
    let _ = app.emit("buildor-event", serde_json::json!({
        "type": "agent-failed",
        "data": {
            "agentSessionId": &session_id,
            "reason": "takeover",
        }
    }));

    // If there's a parent, inject a takeover summary
    if let Some(ref parent_id) = agent.return_to {
        let summary = format!(
            "[BUILDOR: Agent \"{}\" was taken over]\n\
            Original task: {}\n\
            The agent was terminated due to health issues. \
            You may need to complete or redo its work.",
            agent.name,
            agent.prompt.as_deref().unwrap_or("(unknown)"),
        );
        let _ = super::claude::send_message(parent_id.clone(), summary).await;
    }

    Ok(Some(agent))
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentPoolEntryData>, String> {
    let pool = get_pool();
    let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    Ok(map.values().cloned().collect())
}

/// Remove all agents belonging to a parent session from the pool.
/// Called when the parent session exits to prevent stale entries.
#[tauri::command]
pub async fn clear_agents_for_parent(parent_session_id: String) -> Result<u32, String> {
    let pool = get_pool();
    let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    let to_remove: Vec<String> = map.values()
        .filter(|e| e.parent_session_id.as_deref() == Some(&parent_session_id))
        .map(|e| e.session_id.clone())
        .collect();
    let count = to_remove.len() as u32;
    for sid in &to_remove {
        map.remove(sid);
    }
    Ok(count)
}

/// Check if an agent's process is still alive by PID.
#[tauri::command]
pub async fn check_agent_alive(session_id: String) -> Result<bool, String> {
    let pool = get_pool();
    let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    let entry = map.get(&session_id)
        .ok_or_else(|| format!("Agent not found: {}", session_id))?;

    if entry.status != "running" {
        return Ok(false);
    }

    match entry.pid {
        Some(pid) => {
            // Check if process exists — platform-specific
            #[cfg(target_os = "windows")]
            {
                let output = crate::no_window_command("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                match output {
                    Ok(o) => {
                        let text = String::from_utf8_lossy(&o.stdout);
                        Ok(text.contains(&pid.to_string()))
                    }
                    Err(_) => Ok(false),
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                // Unix: kill -0 checks existence without sending a signal
                use std::process::Command;
                let status = Command::new("kill")
                    .args(["-0", &pid.to_string()])
                    .status();
                Ok(status.map(|s| s.success()).unwrap_or(false))
            }
        }
        None => Ok(false), // No PID recorded
    }
}

#[tauri::command]
pub async fn get_agent_status(session_id: String) -> Result<AgentPoolEntryData, String> {
    let pool = get_pool();
    let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    map.get(&session_id)
        .cloned()
        .ok_or_else(|| format!("Agent not found: {}", session_id))
}

/// Inject a message into an agent's session (for escalation, pass-through, etc.)
#[tauri::command]
pub async fn inject_into_agent(session_id: String, message: String) -> Result<(), String> {
    super::claude::send_message(session_id, message).await
}

/// Called by the frontend when it detects a claude-exit event for an agent session.
/// Marks the agent as completed/failed, deposits result into the mailbox, and returns the pool entry.
#[tauri::command]
pub async fn mark_agent_exited(
    app: AppHandle,
    session_id: String,
    exit_success: bool,
    output: Option<String>,
) -> Result<Option<AgentPoolEntryData>, String> {
    let pool = get_pool();
    let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    if let Some(entry) = map.get_mut(&session_id) {
        if entry.status == "running" {
            let now = chrono::Utc::now().to_rfc3339();
            entry.status = if exit_success { "completed".to_string() } else { "failed".to_string() };
            entry.ended_at = Some(now.clone());

            let event_type = if exit_success { "agent-completed" } else { "agent-failed" };
            let _ = app.emit("buildor-event", serde_json::json!({
                "type": event_type,
                "data": {
                    "agentSessionId": &session_id,
                }
            }));

            // Deposit result into the mailbox
            let duration_ms = chrono::DateTime::parse_from_rfc3339(&now)
                .ok()
                .and_then(|end| {
                    chrono::DateTime::parse_from_rfc3339(&entry.started_at)
                        .ok()
                        .map(|start| (end - start).num_milliseconds())
                })
                .unwrap_or(0);

            let mailbox_entry = super::mailbox::MailboxEntryData {
                session_id: entry.session_id.clone(),
                name: entry.name.clone(),
                parent_session_id: entry.parent_session_id.clone(),
                status: entry.status.clone(),
                health_state: entry.health_state.clone(),
                started_at: entry.started_at.clone(),
                ended_at: now,
                output,
                output_path: entry.output_path.clone(),
                return_mode: entry.return_mode.clone(),
                duration_ms,
                model: entry.model.clone(),
                exit_reason: Some("natural".to_string()),
            };

            // Drop the pool lock before depositing (mailbox takes its own lock)
            let entry_clone = entry.clone();
            drop(map);

            let _ = super::mailbox::deposit_result_internal(&app, mailbox_entry);

            return Ok(Some(entry_clone));
        }
        Ok(Some(entry.clone()))
    } else {
        Ok(None)
    }
}
