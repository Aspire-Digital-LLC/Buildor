use crate::logging::db::{LogDb, LogEntry};
use std::sync::OnceLock;

static LOG_DB: OnceLock<LogDb> = OnceLock::new();

fn get_db() -> Result<&'static LogDb, String> {
    LOG_DB.get_or_init(|| LogDb::new().expect("Failed to initialize log database"));
    LOG_DB.get().ok_or_else(|| "Log database not initialized".to_string())
}

#[tauri::command]
pub async fn log_event(
    session_id: Option<String>,
    repo: Option<String>,
    function_area: String,
    level: String,
    operation: String,
    message: String,
    details: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    duration_ms: Option<i64>,
) -> Result<i64, String> {
    let db = get_db()?;
    let timestamp = end_time.clone().unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let entry = LogEntry {
        id: None,
        session_id,
        timestamp,
        end_timestamp: end_time,
        duration_ms,
        repo,
        function_area,
        level,
        operation,
        message,
        details,
    };
    db.insert(&entry)
}

#[tauri::command]
pub async fn get_logs(
    repo: Option<String>,
    function_area: Option<String>,
    level: Option<String>,
    session_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    let db = get_db()?;
    db.query(
        repo.as_deref(),
        function_area.as_deref(),
        level.as_deref(),
        session_id.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub async fn clear_logs() -> Result<(), String> {
    let db = get_db()?;
    db.clear()
}
