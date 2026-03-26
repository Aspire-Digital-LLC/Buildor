#[tauri::command]
pub async fn get_config() -> Result<String, String> {
    // TODO: Read ~/.productaflows/config.json
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn set_config(config: String) -> Result<(), String> {
    // TODO: Write to ~/.productaflows/config.json
    Ok(())
}
