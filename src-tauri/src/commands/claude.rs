use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

static SESSIONS: std::sync::OnceLock<Mutex<HashMap<String, ClaudeSession>>> = std::sync::OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<String, ClaudeSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct ClaudeSession {
    stdin: Option<std::process::ChildStdin>,
    #[allow(dead_code)]
    child: Option<std::process::Child>,
    working_dir: String,
    pid: Option<u32>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartResult {
    pub session_id: String,
    pub pid: Option<u32>,
}

/// Check if a session exists in the registry (used by telemetry cleanup).
pub fn session_exists(session_id: &str) -> bool {
    let sessions = get_sessions();
    match sessions.lock() {
        Ok(map) => map.contains_key(session_id),
        Err(_) => false,
    }
}

/// Get the working directory for an existing session (used by agent spawning).
pub fn get_session_working_dir(session_id: &str) -> Option<String> {
    let sessions = get_sessions();
    let map = sessions.lock().ok()?;
    map.get(session_id).map(|s| s.working_dir.clone())
}

fn is_valid_slug(s: &str) -> bool {
    if s.is_empty() || s.len() > 60 {
        return false;
    }
    if !s.contains('-') {
        return false;
    }
    if !s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return false;
    }
    if s.contains("--") || s.starts_with('-') || s.ends_with('-') {
        return false;
    }
    let word_count = s.split('-').count();
    word_count >= 2 && word_count <= 6
}

fn clean_response(raw: &str) -> String {
    let first_line = raw.lines().next().unwrap_or("").trim();
    first_line
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != ' ', "")
        .trim()
        .replace(' ', "-")
        .replace("--", "-")
        .trim_matches('-')
        .to_string()
}

pub fn call_haiku(prompt: &str) -> Result<String, String> {
    let pool = crate::operation_pool::OPERATION_POOL.get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let prompt_owned = prompt.to_string();
    let rx = tauri::async_runtime::block_on(pool.submit(
        "llm/haiku-oneshot".to_string(),
        crate::operation_pool::Tier::Subagent,
        move || {
            let output = crate::no_window_command("claude")
                .args(["--print", "--model", "haiku", &prompt_owned])
                .output()
                .map_err(|e| format!("Failed to run claude: {}", e))?;

            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("Claude failed: {}", stderr.trim()))
            }
        },
    ));

    rx.blocking_recv()
        .map_err(|_| "Pool operation cancelled".to_string())?
}

#[tauri::command]
pub async fn generate_slug(description: String) -> Result<String, String> {
    let initial_prompt = format!(
        "TASK: Convert this text into a git branch slug.\n\
        RULES:\n\
        - Output ONLY the slug. No explanation, no questions, no commentary.\n\
        - 2-5 words, lowercase, separated by hyphens. Example format: fix-login-bug\n\
        - Only a-z, 0-9, and hyphens allowed.\n\
        - Capture the intent even if the description is incomplete or has typos.\n\
        - NEVER ask for clarification. NEVER output anything except the slug.\n\n\
        Examples:\n\
        Input: \"Add dark mode toggle to settings\" -> dark-mode-toggle\n\
        Input: \"fix the login bug on iOS\" -> fix-ios-login-bug\n\
        Input: \"We need to change the app name to\" -> rename-app\n\
        Input: \"Issue #54\" -> issue-54-fix\n\
        Input: \"refactor auth middleware because of compliance\" -> refactor-auth-middleware\n\n\
        Input: \"{}\"\n\
        Output:",
        description
    );

    let retry_prompt = |bad_response: &str| -> String {
        format!(
            "Your previous response \"{}\" did not follow instructions.\n\
            I need ONLY a git branch slug: 2-5 lowercase words separated by hyphens.\n\
            Example: fix-login-bug\n\
            No sentences, no questions, no explanation.\n\
            The description was: \"{}\"\n\
            Output ONLY the slug:",
            bad_response, description
        )
    };

    // Attempt 1
    let raw = call_haiku(&initial_prompt)?;
    let slug = clean_response(&raw);
    if is_valid_slug(&slug) {
        return Ok(slug);
    }

    // Attempt 2
    let raw2 = call_haiku(&retry_prompt(&raw))?;
    let slug2 = clean_response(&raw2);
    if is_valid_slug(&slug2) {
        return Ok(slug2);
    }

    // Attempt 3
    let raw3 = call_haiku(&retry_prompt(&raw2))?;
    let slug3 = clean_response(&raw3);
    if is_valid_slug(&slug3) {
        return Ok(slug3);
    }

    Err(format!(
        "Failed to generate valid slug after 3 attempts. Last response: \"{}\"",
        raw3
    ))
}

#[tauri::command]
pub async fn start_session(app: AppHandle, working_dir: String, model: Option<String>, system_prompt: Option<String>) -> Result<SessionStartResult, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let mut args = vec![
        "--print".to_string(),
        "--input-format".to_string(), "stream-json".to_string(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(), "default".to_string(),
        "--permission-prompt-tool".to_string(), "stdio".to_string(),
        "--disallowedTools".to_string(), "Agent".to_string(),
        // Force all tools through permission prompt by clearing allow lists.
        // Buildor manages its own auto-approve rules and routes everything
        // through the operation pool for scheduling.
        "--settings".to_string(), r#"{"permissions":{"allow":[],"deny":[]}}"#.to_string(),
    ];
    if let Some(ref m) = model {
        args.push("--model".to_string());
        args.push(m.clone());
    }
    if let Some(ref prompt) = system_prompt {
        args.push("--append-system-prompt".to_string());
        args.push(prompt.clone());
    }

    // Route the initial spawn through the operation pool
    let pool = crate::operation_pool::OPERATION_POOL.get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let child_slot: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    let child_slot_inner = child_slot.clone();
    let working_dir_clone = working_dir.clone();

    let rx = pool.submit(
        format!("llm/{}", session_id),
        crate::operation_pool::Tier::App,
        move || {
            let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            let child = crate::no_window_command("claude")
                .args(&args_refs)
                .current_dir(&working_dir_clone)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn claude: {}", e))?;
            *child_slot_inner.lock().map_err(|e| format!("Lock error: {}", e))? = Some(child);
            Ok("spawned".to_string())
        },
    ).await;

    rx.await.map_err(|_| "Pool operation cancelled".to_string())??;

    let mut child = child_slot.lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .take()
        .ok_or_else(|| "Child process not available after pool spawn".to_string())?;

    let pid = child.id();

    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;
    let stdin = child.stdin.take()
        .ok_or_else(|| "Failed to capture stdin".to_string())?;

    let sid = session_id.clone();

    // Stream stdout (JSON lines) to frontend
    let app_handle = app.clone();
    let sid_out = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let event_name = format!("claude-output-{}", sid_out);
        let mut slow_emit_count: u64 = 0;
        let mut total_emit_ms: u64 = 0;
        let mut line_count: u64 = 0;
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if !text.trim().is_empty() {
                        let t0 = std::time::Instant::now();
                        let _ = app_handle.emit(&event_name, &text);
                        let elapsed_ms = t0.elapsed().as_millis() as u64;
                        line_count += 1;
                        total_emit_ms += elapsed_ms;
                        if elapsed_ms > 50 {
                            slow_emit_count += 1;
                            // Log slow emits to SQLite (queryable via /read-logs)
                            if let Ok(db) = crate::logging::get_log_db() {
                                let _ = db.insert(&crate::logging::db::LogEntry {
                                    id: None,
                                    session_id: Some(sid_out.clone()),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    end_timestamp: None,
                                    duration_ms: Some(elapsed_ms as i64),
                                    repo: None,
                                    function_area: "claude-chat".to_string(),
                                    level: "warn".to_string(),
                                    operation: "stdout-emit-slow".to_string(),
                                    message: format!("emit took {}ms (line #{}, slow #{})", elapsed_ms, line_count, slow_emit_count),
                                    details: None,
                                });
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        // Log session summary
        if let Ok(db) = crate::logging::get_log_db() {
            let _ = db.insert(&crate::logging::db::LogEntry {
                id: None,
                session_id: Some(sid_out.clone()),
                timestamp: chrono::Utc::now().to_rfc3339(),
                end_timestamp: None,
                duration_ms: Some(total_emit_ms as i64),
                repo: None,
                function_area: "claude-chat".to_string(),
                level: "info".to_string(),
                operation: "stdout-emit-summary".to_string(),
                message: format!("{} lines, {} slow emits (>50ms), total emit time: {}ms, avg: {:.1}ms",
                    line_count, slow_emit_count, total_emit_ms,
                    if line_count > 0 { total_emit_ms as f64 / line_count as f64 } else { 0.0 }),
                details: None,
            });
        }
        let _ = app_handle.emit(&format!("claude-exit-{}", sid_out), "exited");
    });

    // Stream stderr too
    let app_handle2 = app.clone();
    let sid_err = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if !text.trim().is_empty() {
                        let _ = app_handle2.emit(&format!("claude-stderr-{}", sid_err), &text);
                    }
                }
                Err(_) => break,
            }
        }
    });

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id.clone(), ClaudeSession {
        stdin: Some(stdin),
        child: Some(child),
        working_dir,
        pid: Some(pid),
    });

    Ok(SessionStartResult { session_id, pid: Some(pid) })
}

#[tauri::command]
pub async fn send_message(session_id: String, message: String) -> Result<(), String> {
    use std::io::Write;

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let stdin = session.stdin.as_mut()
        .ok_or_else(|| "Session stdin not available".to_string())?;

    // Send message as JSON to stream-json input
    // Claude expects: {"type":"user","message":{"role":"user","content":"<text>"}}
    let input_msg = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": message
        }
    });

    let json_str = serde_json::to_string(&input_msg)
        .map_err(|e| format!("Failed to serialize message: {}", e))?;

    writeln!(stdin, "{}", json_str)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    Ok(())
}

/// Send a message with optional image attachments to Claude
/// Images are provided as objects with { media_type, data } (base64)
#[tauri::command]
pub async fn send_message_with_images(
    session_id: String,
    text: String,
    images: Vec<serde_json::Value>,
) -> Result<(), String> {
    use std::io::Write;

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let stdin = session.stdin.as_mut()
        .ok_or_else(|| "Session stdin not available".to_string())?;

    // Build content array: images first, then text
    let mut content = Vec::new();
    for img in &images {
        content.push(serde_json::json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img["media_type"],
                "data": img["data"]
            }
        }));
    }
    if !text.is_empty() {
        content.push(serde_json::json!({
            "type": "text",
            "text": text
        }));
    }

    let input_msg = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": content
        }
    });

    let json_str = serde_json::to_string(&input_msg)
        .map_err(|e| format!("Failed to serialize message: {}", e))?;

    writeln!(stdin, "{}", json_str)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    Ok(())
}

/// Read a file as base64 (for image attachments)
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<(String, String), String> {
    use base64::Engine;
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let media_type = match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    Ok((media_type.to_string(), b64))
}

/// Internal: write a permission response to the session's stdin.
/// Used by both the direct and pool-gated permission paths.
fn write_permission_response(
    session_id: &str,
    request_id: &str,
    approved: bool,
    tool_input: Option<serde_json::Value>,
) -> Result<(), String> {
    use std::io::Write;

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let stdin = session.stdin.as_mut()
        .ok_or_else(|| "Session stdin not available".to_string())?;

    let response = if approved {
        let mut response_data = serde_json::json!({
            "behavior": "allow"
        });
        if let Some(input) = tool_input {
            response_data["updatedInput"] = input;
        }
        serde_json::json!({
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": request_id,
                "response": response_data
            }
        })
    } else {
        serde_json::json!({
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": request_id,
                "response": {
                    "behavior": "deny",
                    "message": "Permission denied by user in Buildor UI"
                }
            }
        })
    };

    let json_str = serde_json::to_string(&response)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    writeln!(stdin, "{}", json_str)
        .map_err(|e| format!("Failed to write: {}", e))?;
    stdin.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    Ok(())
}

/// Send a permission response (approve/deny) back to Claude — direct, no pool gating.
/// Kept for backward compat but prefer respond_to_permission_pooled for scheduled execution.
#[tauri::command]
pub async fn respond_to_permission(
    session_id: String,
    request_id: String,
    approved: bool,
    tool_input: Option<serde_json::Value>,
) -> Result<(), String> {
    write_permission_response(&session_id, &request_id, approved, tool_input)?;

    Ok(())
}

/// Send a permission response through the operation pool.
/// The pool schedules when the response is actually sent, preventing
/// concurrent tool executions from overwhelming the system.
///
/// resource_key: lane key for pool scheduling (e.g. "tool/Bash/C:/Git/Repo")
/// tier: "app", "user", or "subagent"
#[tauri::command]
pub async fn respond_to_permission_pooled(
    session_id: String,
    request_id: String,
    approved: bool,
    tool_input: Option<serde_json::Value>,
    resource_key: String,
    tier: Option<String>,
) -> Result<(), String> {
    let pool = crate::operation_pool::OPERATION_POOL.get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let tier_enum = match tier.as_deref() {
        Some("app") => crate::operation_pool::Tier::App,
        Some("subagent") => crate::operation_pool::Tier::Subagent,
        _ => crate::operation_pool::Tier::User,
    };

    let rx = pool.submit(
        resource_key,
        tier_enum,
        move || {
            write_permission_response(&session_id, &request_id, approved, tool_input)?;
            Ok("ok".to_string())
        },
    ).await;

    rx.await.map_err(|_| "Pool operation cancelled".to_string())??;
    Ok(())
}

/// Send an interrupt control_request to stop the current turn without killing the process.
/// The session stays alive with full context preserved and prompt cache warm.
#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    use std::io::Write;

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let stdin = session.stdin.as_mut()
        .ok_or_else(|| "Session stdin not available".to_string())?;

    let request_id = format!("req_interrupt_{}", uuid::Uuid::new_v4());
    let msg = serde_json::json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {
            "subtype": "interrupt"
        }
    });

    let json_str = serde_json::to_string(&msg)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    writeln!(stdin, "{}", json_str)
        .map_err(|e| format!("Failed to write interrupt: {}", e))?;
    stdin.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    Ok(())
}

/// Send a set_model control_request to change the model without restarting the process.
/// Preserves full context and prompt cache.
#[tauri::command]
pub async fn set_session_model(session_id: String, model: String) -> Result<(), String> {
    use std::io::Write;

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let stdin = session.stdin.as_mut()
        .ok_or_else(|| "Session stdin not available".to_string())?;

    let request_id = format!("req_model_{}", uuid::Uuid::new_v4());
    let msg = serde_json::json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {
            "subtype": "set_model",
            "model": model
        }
    });

    let json_str = serde_json::to_string(&msg)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    writeln!(stdin, "{}", json_str)
        .map_err(|e| format!("Failed to write: {}", e))?;
    stdin.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    Ok(())
}

/// Start a Claude session configured as a Buildor agent.
/// Called internally by agents::spawn_agent — not a Tauri command.
/// Returns (session_id, pid) on success.
pub fn start_agent_session_sync(
    app: &AppHandle,
    working_dir: &str,
    model: Option<&str>,
    system_prompt: &str,
) -> Result<SessionStartResult, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let mut args = vec![
        "--print".to_string(),
        "--input-format".to_string(), "stream-json".to_string(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(), "default".to_string(),
        "--permission-prompt-tool".to_string(), "stdio".to_string(),
        "--disallowedTools".to_string(), "Agent".to_string(),
        "--settings".to_string(), r#"{"permissions":{"allow":[],"deny":[]}}"#.to_string(),
        "--append-system-prompt".to_string(), system_prompt.to_string(),
    ];
    if let Some(m) = model {
        args.push("--model".to_string());
        args.push(m.to_string());
    }

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    // Note: pool gating for agent sessions happens in spawn_agent (agents.rs),
    // which wraps this entire function call. No double-pooling needed here.
    let mut child = crate::no_window_command("claude")
        .args(&args_refs)
        .current_dir(working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent claude: {}", e))?;

    let pid = child.id();

    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture agent stdout".to_string())?;
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture agent stderr".to_string())?;
    let stdin = child.stdin.take()
        .ok_or_else(|| "Failed to capture agent stdin".to_string())?;

    let sid = session_id.clone();

    // Stream stdout (JSON lines) to frontend — same event pattern as main sessions
    let app_handle = app.clone();
    let sid_out = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let event_name = format!("claude-output-{}", sid_out);
        let mut slow_emit_count: u64 = 0;
        let mut total_emit_ms: u64 = 0;
        let mut line_count: u64 = 0;
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if !text.trim().is_empty() {
                        let t0 = std::time::Instant::now();
                        let _ = app_handle.emit(&event_name, &text);
                        let elapsed_ms = t0.elapsed().as_millis() as u64;
                        line_count += 1;
                        total_emit_ms += elapsed_ms;
                        if elapsed_ms > 50 {
                            slow_emit_count += 1;
                            if let Ok(db) = crate::logging::get_log_db() {
                                let _ = db.insert(&crate::logging::db::LogEntry {
                                    id: None,
                                    session_id: Some(sid_out.clone()),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    end_timestamp: None,
                                    duration_ms: Some(elapsed_ms as i64),
                                    repo: None,
                                    function_area: "claude-chat".to_string(),
                                    level: "warn".to_string(),
                                    operation: "agent-stdout-emit-slow".to_string(),
                                    message: format!("emit took {}ms (line #{}, slow #{})", elapsed_ms, line_count, slow_emit_count),
                                    details: None,
                                });
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        if let Ok(db) = crate::logging::get_log_db() {
            let _ = db.insert(&crate::logging::db::LogEntry {
                id: None,
                session_id: Some(sid_out.clone()),
                timestamp: chrono::Utc::now().to_rfc3339(),
                end_timestamp: None,
                duration_ms: Some(total_emit_ms as i64),
                repo: None,
                function_area: "claude-chat".to_string(),
                level: "info".to_string(),
                operation: "agent-stdout-emit-summary".to_string(),
                message: format!("{} lines, {} slow emits (>50ms), total emit time: {}ms, avg: {:.1}ms",
                    line_count, slow_emit_count, total_emit_ms,
                    if line_count > 0 { total_emit_ms as f64 / line_count as f64 } else { 0.0 }),
                details: None,
            });
        }
        let _ = app_handle.emit(&format!("claude-exit-{}", sid_out), "exited");
    });

    // Stream stderr
    let app_handle2 = app.clone();
    let sid_err = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if !text.trim().is_empty() {
                        let _ = app_handle2.emit(&format!("claude-stderr-{}", sid_err), &text);
                    }
                }
                Err(_) => break,
            }
        }
    });

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id.clone(), ClaudeSession {
        stdin: Some(stdin),
        child: Some(child),
        working_dir: working_dir.to_string(),
        pid: Some(pid),
    });

    Ok(SessionStartResult { session_id, pid: Some(pid) })
}

#[tauri::command]
pub async fn stop_session(session_id: String) -> Result<(), String> {
    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    if let Some(mut session) = map.remove(&session_id) {
        drop(session.stdin.take()); // Close stdin first
        if let Some(mut child) = session.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Clean up telemetry subscription
    crate::telemetry::unsubscribe(&session_id);

    Ok(())
}

/// Stop all Claude sessions whose working directory matches the given path.
/// Called by worktree close to release file locks before directory removal.
pub fn stop_sessions_in_dir(dir: &str) {
    let normalized = dir.replace('\\', "/");
    let sessions = get_sessions();
    let mut map = match sessions.lock() {
        Ok(m) => m,
        Err(_) => return,
    };

    let to_remove: Vec<String> = map.iter()
        .filter(|(_, s)| s.working_dir.replace('\\', "/") == normalized)
        .map(|(id, _)| id.clone())
        .collect();

    for id in to_remove {
        if let Some(mut session) = map.remove(&id) {
            drop(session.stdin.take());
            if let Some(mut child) = session.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        crate::telemetry::unsubscribe(&id);
    }
}

#[tauri::command]
pub async fn get_session_status(session_id: String) -> Result<String, String> {
    let sessions = get_sessions();
    let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    if map.contains_key(&session_id) {
        Ok("active".to_string())
    } else {
        Ok("inactive".to_string())
    }
}

#[tauri::command]
pub async fn list_claude_sessions() -> Result<Vec<String>, String> {
    let sessions = get_sessions();
    let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(map.keys().cloned().collect())
}

/// Add a permission rule to .claude/settings.local.json in the session's working directory
#[tauri::command]
pub async fn add_permission_rule(session_id: String, rule: String) -> Result<(), String> {
    let working_dir = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.working_dir.clone()
    };

    let settings_path = std::path::Path::new(&working_dir)
        .join(".claude")
        .join("settings.local.json");

    // Read existing settings or create new
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Ensure permissions.allow array exists
    if settings.get("permissions").is_none() {
        settings["permissions"] = serde_json::json!({ "allow": [] });
    }
    if settings["permissions"].get("allow").is_none() {
        settings["permissions"]["allow"] = serde_json::json!([]);
    }

    // Check if rule already exists
    let allow = settings["permissions"]["allow"].as_array().unwrap_or(&vec![]).clone();
    if !allow.iter().any(|v| v.as_str() == Some(&rule)) {
        settings["permissions"]["allow"]
            .as_array_mut()
            .ok_or_else(|| "Failed to get allow array".to_string())?
            .push(serde_json::Value::String(rule));
    }

    // Write back
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .claude dir: {}", e))?;
    }
    let formatted = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&settings_path, formatted)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Read Claude credentials and config to get plan type, tier, and version
#[tauri::command]
pub async fn query_claude_status() -> Result<String, String> {
    let mut result = serde_json::json!({});

    // 1. Read ~/.claude/.credentials.json for plan/tier info
    if let Some(home) = dirs_next::home_dir() {
        let creds_path = home.join(".claude").join(".credentials.json");
        if creds_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&creds_path) {
                if let Ok(creds) = serde_json::from_str::<serde_json::Value>(&content) {
                    let oauth = &creds["claudeAiOauth"];
                    if let Some(sub_type) = oauth["subscriptionType"].as_str() {
                        result["subscriptionType"] = serde_json::Value::String(sub_type.to_string());
                    }
                    if let Some(tier) = oauth["rateLimitTier"].as_str() {
                        result["rateLimitTier"] = serde_json::Value::String(tier.to_string());
                    }
                    if let Some(scopes) = oauth["scopes"].as_array() {
                        result["scopes"] = serde_json::Value::Array(scopes.clone());
                    }
                }
            }
        }
    }

    // 2. Get claude CLI version
    if let Ok(output) = crate::no_window_command("claude").args(["--version"]).output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            result["version"] = serde_json::Value::String(version);
        }
    }

    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

/// Run a claude CLI command (e.g., login, logout) and return its output
#[tauri::command]
pub async fn run_claude_cli(args: Vec<String>) -> Result<String, String> {
    let output = crate::no_window_command("claude")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{}\n{}", stdout, stderr).trim().to_string())
    }
}
