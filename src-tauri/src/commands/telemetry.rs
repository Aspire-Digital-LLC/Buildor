#[tauri::command]
pub async fn subscribe_telemetry(
    session_id: String,
    streams: Option<Vec<String>>,
) -> Result<(), String> {
    let streams = streams.unwrap_or_else(|| vec!["pool".to_string(), "mailbox".to_string()]);
    crate::telemetry::subscribe(session_id, streams);
    Ok(())
}

#[tauri::command]
pub async fn unsubscribe_telemetry(session_id: String) -> Result<(), String> {
    crate::telemetry::unsubscribe(&session_id);
    Ok(())
}
