use crate::orchestrator::types::Flow;

#[tauri::command]
pub async fn list_flows() -> Result<Vec<String>, String> {
    // TODO: Read flow files from workflows repo
    Ok(vec![])
}

#[tauri::command]
pub async fn get_flow(name: String) -> Result<String, String> {
    // TODO: Read and return flow JSON
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn execute_flow(name: String, params: String) -> Result<(), String> {
    // TODO: Start flow orchestration
    Ok(())
}
