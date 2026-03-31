pub mod db;

use std::sync::OnceLock;
use db::LogDb;

static LOG_DB: OnceLock<LogDb> = OnceLock::new();

pub fn get_log_db() -> Result<&'static LogDb, String> {
    LOG_DB.get_or_init(|| LogDb::new().expect("Failed to initialize log database"));
    LOG_DB.get().ok_or_else(|| "Log database not initialized".to_string())
}
