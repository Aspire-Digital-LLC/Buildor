#[tauri::command]
pub async fn start_session(working_dir: String) -> Result<String, String> {
    // TODO: Spawn Claude Code process for working_dir
    Ok("stub-session-id".to_string())
}

#[tauri::command]
pub async fn send_message(session_id: String, message: String) -> Result<String, String> {
    // TODO: Send message to Claude Code session
    Ok("stub: response".to_string())
}

#[tauri::command]
pub async fn get_session_status(session_id: String) -> Result<String, String> {
    // TODO: Check if session is active
    Ok("active".to_string())
}
