use rusqlite::{Connection, params};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: Option<i64>,
    pub session_id: Option<String>,
    pub timestamp: String,
    pub end_timestamp: Option<String>,
    pub duration_ms: Option<i64>,
    pub repo: Option<String>,
    pub function_area: String,
    pub level: String,
    pub operation: String,
    pub message: String,
    pub details: Option<String>,
}

pub struct LogDb {
    conn: Mutex<Connection>,
}

impl LogDb {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::db_path();
        std::fs::create_dir_all(db_path.parent().unwrap())
            .map_err(|e| format!("Failed to create log dir: {}", e))?;

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open log db: {}", e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                timestamp TEXT NOT NULL,
                end_timestamp TEXT,
                duration_ms INTEGER,
                repo TEXT,
                function_area TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'info',
                operation TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_logs_repo ON logs(repo);
            CREATE INDEX IF NOT EXISTS idx_logs_function_area ON logs(function_area);
            CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
            CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);",
        ).map_err(|e| format!("Failed to create logs table: {}", e))?;

        Ok(LogDb { conn: Mutex::new(conn) })
    }

    fn db_path() -> PathBuf {
        let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
        home.join(".productaflows").join("logs.db")
    }

    pub fn insert(&self, entry: &LogEntry) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO logs (session_id, timestamp, end_timestamp, duration_ms, repo, function_area, level, operation, message, details)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                entry.session_id,
                entry.timestamp,
                entry.end_timestamp,
                entry.duration_ms,
                entry.repo,
                entry.function_area,
                entry.level,
                entry.operation,
                entry.message,
                entry.details,
            ],
        ).map_err(|e| format!("Failed to insert log: {}", e))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn query(
        &self,
        repo: Option<&str>,
        function_area: Option<&str>,
        level: Option<&str>,
        session_id: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<LogEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let mut sql = String::from("SELECT id, session_id, timestamp, end_timestamp, duration_ms, repo, function_area, level, operation, message, details FROM logs WHERE 1=1");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(r) = repo {
            sql.push_str(" AND repo = ?");
            param_values.push(Box::new(r.to_string()));
        }
        if let Some(f) = function_area {
            sql.push_str(" AND function_area = ?");
            param_values.push(Box::new(f.to_string()));
        }
        if let Some(l) = level {
            sql.push_str(" AND level = ?");
            param_values.push(Box::new(l.to_string()));
        }
        if let Some(s) = session_id {
            sql.push_str(" AND session_id = ?");
            param_values.push(Box::new(s.to_string()));
        }

        sql.push_str(" ORDER BY timestamp DESC LIMIT ? OFFSET ?");
        param_values.push(Box::new(limit));
        param_values.push(Box::new(offset));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(LogEntry {
                id: row.get(0)?,
                session_id: row.get(1)?,
                timestamp: row.get(2)?,
                end_timestamp: row.get(3)?,
                duration_ms: row.get(4)?,
                repo: row.get(5)?,
                function_area: row.get(6)?,
                level: row.get(7)?,
                operation: row.get(8)?,
                message: row.get(9)?,
                details: row.get(10)?,
            })
        }).map_err(|e| format!("Query error: {}", e))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(entries)
    }

    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute("DELETE FROM logs", [])
            .map_err(|e| format!("Failed to clear logs: {}", e))?;
        Ok(())
    }
}
