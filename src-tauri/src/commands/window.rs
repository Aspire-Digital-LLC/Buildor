#[tauri::command]
pub async fn open_breakout_window(panel_type: String, title: String) -> Result<(), String> {
    // TODO: Create new WebviewWindow
    Ok(())
}

#[tauri::command]
pub async fn close_breakout_window(label: String) -> Result<(), String> {
    // TODO: Close window by label
    Ok(())
}
