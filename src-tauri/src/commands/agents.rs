use serde::{Serialize, Deserialize};

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
}

// Stubs — will be filled in Phase 5

#[tauri::command]
pub async fn spawn_agent(
    _working_dir: String,
    _prompt: String,
    _name: String,
    _parent_session_id: Option<String>,
    _return_to: Option<String>,
    _source_skill: Option<String>,
    _model: Option<String>,
    _return_mode: Option<String>,
    _output_path: Option<String>,
) -> Result<String, String> {
    Err("Agent spawning not implemented yet (Phase 5)".to_string())
}

#[tauri::command]
pub async fn kill_agent(
    _session_id: String,
    _mark_completed: Option<bool>,
) -> Result<(), String> {
    Err("Agent management not implemented yet (Phase 5)".to_string())
}

#[tauri::command]
pub async fn extend_agent(
    _session_id: String,
    _seconds: Option<u32>,
) -> Result<(), String> {
    Err("Agent management not implemented yet (Phase 6)".to_string())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentPoolEntryData>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn get_agent_status(_session_id: String) -> Result<AgentPoolEntryData, String> {
    Err("Agent not found".to_string())
}
