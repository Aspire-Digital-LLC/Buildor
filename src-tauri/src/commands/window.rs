use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_claude_window(
    app: AppHandle,
    label: String,
    title: String,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    // Check if window already exists
    if app.get_webview_window(&label).is_some() {
        // Focus existing window
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_focus();
        }
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("/".into()))
        .title(&title)
        .inner_size(width, height)
        .position(x, y)
        .theme(Some(tauri::Theme::Dark))
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_breakout_window(_panel_type: String, _title: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn close_breakout_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}
