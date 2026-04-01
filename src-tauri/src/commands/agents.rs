use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};

// --- Agent Pool (in-memory, flat) ---

static AGENT_POOL: std::sync::OnceLock<Mutex<HashMap<String, AgentPoolEntryData>>> = std::sync::OnceLock::new();

fn get_pool() -> &'static Mutex<HashMap<String, AgentPoolEntryData>> {
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
        - You cannot spawn sub-agents.",
    );

    // Start the Claude session via the shared session infrastructure
    let result = super::claude::start_agent_session_sync(
        &app,
        &resolved_dir,
        model.as_deref(),
        &agent_system_prompt,
    )?;

    let agent_session_id = result.session_id.clone();

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
        pid: result.pid,
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

    // Send the initial prompt as the first user message
    // (system prompt sets context, but the task itself is sent as a user message to trigger Claude)
    super::claude::send_message(agent_session_id.clone(), prompt).await?;

    Ok(agent_session_id)
}

#[tauri::command]
pub async fn kill_agent(
    app: AppHandle,
    session_id: String,
    mark_completed: Option<bool>,
) -> Result<(), String> {
    let completed = mark_completed.unwrap_or(false);

    // Update pool entry
    {
        let pool = get_pool();
        let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
        if let Some(entry) = map.get_mut(&session_id) {
            entry.status = if completed { "completed".to_string() } else { "failed".to_string() };
            entry.ended_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    // Stop the underlying Claude session
    super::claude::stop_session(session_id.clone()).await?;

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

#[tauri::command]
pub async fn extend_agent(
    _session_id: String,
    _seconds: Option<u32>,
) -> Result<(), String> {
    // Phase 6: will reset health monitor timers
    Err("Agent health extension not implemented yet (Phase 6)".to_string())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentPoolEntryData>, String> {
    let pool = get_pool();
    let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    Ok(map.values().cloned().collect())
}

#[tauri::command]
pub async fn get_agent_status(session_id: String) -> Result<AgentPoolEntryData, String> {
    let pool = get_pool();
    let map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    map.get(&session_id)
        .cloned()
        .ok_or_else(|| format!("Agent not found: {}", session_id))
}

/// Inject a message into an agent's stdin (for escalation, pass-through, etc.)
#[tauri::command]
pub async fn inject_into_agent(session_id: String, message: String) -> Result<(), String> {
    super::claude::send_message(session_id, message).await
}

/// Called by the frontend when it detects a claude-exit event for an agent session.
/// Marks the agent as completed/failed and returns the pool entry for result routing.
#[tauri::command]
pub async fn mark_agent_exited(
    app: AppHandle,
    session_id: String,
    exit_success: bool,
) -> Result<Option<AgentPoolEntryData>, String> {
    let pool = get_pool();
    let mut map = pool.lock().map_err(|e| format!("Pool lock error: {}", e))?;
    if let Some(entry) = map.get_mut(&session_id) {
        if entry.status == "running" {
            entry.status = if exit_success { "completed".to_string() } else { "failed".to_string() };
            entry.ended_at = Some(chrono::Utc::now().to_rfc3339());

            let event_type = if exit_success { "agent-completed" } else { "agent-failed" };
            let _ = app.emit("buildor-event", serde_json::json!({
                "type": event_type,
                "data": {
                    "agentSessionId": &session_id,
                }
            }));
        }
        Ok(Some(entry.clone()))
    } else {
        Ok(None)
    }
}
