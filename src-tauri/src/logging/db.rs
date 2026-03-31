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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub project_name: String,
    pub repo_path: String,
    pub worktree_session_id: Option<String>,
    pub branch_name: String,
    pub title: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub message_count: i64,
    pub cached_summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub id: Option<i64>,
    pub session_id: String,
    pub seq: i64,
    pub role: String,
    pub content_json: String,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub duration_ms: Option<i64>,
    pub is_result: bool,
    pub created_at: String,
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

        // Enable WAL mode for crash recovery
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");

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
            CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                project_name TEXT NOT NULL,
                repo_path TEXT NOT NULL,
                worktree_session_id TEXT,
                branch_name TEXT NOT NULL,
                title TEXT,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                message_count INTEGER DEFAULT 0,
                cached_summary TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_name);
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_worktree ON chat_sessions(worktree_session_id);
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_started ON chat_sessions(started_at);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                role TEXT NOT NULL,
                content_json TEXT NOT NULL,
                model TEXT,
                cost_usd REAL,
                duration_ms INTEGER,
                is_result INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_seq ON chat_messages(session_id, seq);",
        ).map_err(|e| format!("Failed to create tables: {}", e))?;

        // Cull logs older than 30 days on startup
        let _ = conn.execute(
            "DELETE FROM logs WHERE timestamp < datetime('now', '-30 days')",
            [],
        );

        Ok(LogDb { conn: Mutex::new(conn) })
    }

    fn db_path() -> PathBuf {
        let base = if let Some(config) = dirs_next::config_dir() {
            config.join("Buildor")
        } else {
            let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(".buildor")
        };
        base.join("logs.db")
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

    // --- Chat History methods ---

    pub fn insert_chat_session(&self, session: &ChatSession) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO chat_sessions (id, project_name, repo_path, worktree_session_id, branch_name, title, started_at, ended_at, message_count, cached_summary)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                session.id,
                session.project_name,
                session.repo_path,
                session.worktree_session_id,
                session.branch_name,
                session.title,
                session.started_at,
                session.ended_at,
                session.message_count,
                session.cached_summary,
            ],
        ).map_err(|e| format!("Failed to insert chat session: {}", e))?;
        Ok(())
    }

    pub fn end_chat_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE chat_sessions SET ended_at = ?1 WHERE id = ?2 AND ended_at IS NULL",
            params![now, id],
        ).map_err(|e| format!("Failed to end chat session: {}", e))?;
        Ok(())
    }

    pub fn insert_chat_message(&self, msg: &ChatMessageRecord) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO chat_messages (session_id, seq, role, content_json, model, cost_usd, duration_ms, is_result, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                msg.session_id,
                msg.seq,
                msg.role,
                msg.content_json,
                msg.model,
                msg.cost_usd,
                msg.duration_ms,
                msg.is_result as i32,
                msg.created_at,
            ],
        ).map_err(|e| format!("Failed to insert chat message: {}", e))?;

        // Increment message count
        conn.execute(
            "UPDATE chat_sessions SET message_count = message_count + 1 WHERE id = ?1",
            params![msg.session_id],
        ).map_err(|e| format!("Failed to increment message count: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn query_chat_sessions(
        &self,
        project_name: &str,
        worktree_session_id: Option<&str>,
    ) -> Result<Vec<ChatSession>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(wt_id) = worktree_session_id {
            (
                "SELECT id, project_name, repo_path, worktree_session_id, branch_name, title, started_at, ended_at, message_count, cached_summary
                 FROM chat_sessions WHERE project_name = ?1 AND worktree_session_id = ?2 ORDER BY started_at DESC".to_string(),
                vec![Box::new(project_name.to_string()), Box::new(wt_id.to_string())],
            )
        } else {
            (
                "SELECT id, project_name, repo_path, worktree_session_id, branch_name, title, started_at, ended_at, message_count, cached_summary
                 FROM chat_sessions WHERE project_name = ?1 AND worktree_session_id IS NULL ORDER BY started_at DESC".to_string(),
                vec![Box::new(project_name.to_string())],
            )
        };

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                project_name: row.get(1)?,
                repo_path: row.get(2)?,
                worktree_session_id: row.get(3)?,
                branch_name: row.get(4)?,
                title: row.get(5)?,
                started_at: row.get(6)?,
                ended_at: row.get(7)?,
                message_count: row.get(8)?,
                cached_summary: row.get(9)?,
            })
        }).map_err(|e| format!("Query error: {}", e))?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(sessions)
    }

    pub fn query_chat_messages(
        &self,
        session_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ChatMessageRecord>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, seq, role, content_json, model, cost_usd, duration_ms, is_result, created_at
             FROM chat_messages WHERE session_id = ?1 ORDER BY seq ASC LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Query error: {}", e))?;

        let rows = stmt.query_map(params![session_id, limit, offset], |row| {
            Ok(ChatMessageRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                seq: row.get(2)?,
                role: row.get(3)?,
                content_json: row.get(4)?,
                model: row.get(5)?,
                cost_usd: row.get(6)?,
                duration_ms: row.get(7)?,
                is_result: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        }).map_err(|e| format!("Query error: {}", e))?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(messages)
    }

    pub fn get_chat_message_count(&self, session_id: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.query_row(
            "SELECT message_count FROM chat_sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        ).map_err(|e| format!("Query error: {}", e))
    }

    pub fn query_chat_sessions_by_id(&self, id: &str) -> Result<ChatSession, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.query_row(
            "SELECT id, project_name, repo_path, worktree_session_id, branch_name, title, started_at, ended_at, message_count, cached_summary
             FROM chat_sessions WHERE id = ?1",
            params![id],
            |row| Ok(ChatSession {
                id: row.get(0)?,
                project_name: row.get(1)?,
                repo_path: row.get(2)?,
                worktree_session_id: row.get(3)?,
                branch_name: row.get(4)?,
                title: row.get(5)?,
                started_at: row.get(6)?,
                ended_at: row.get(7)?,
                message_count: row.get(8)?,
                cached_summary: row.get(9)?,
            }),
        ).map_err(|e| format!("Session not found: {}", e))
    }

    pub fn update_session_title(&self, id: &str, title: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE chat_sessions SET title = ?1 WHERE id = ?2",
            params![title, id],
        ).map_err(|e| format!("Failed to update session title: {}", e))?;
        Ok(())
    }

    pub fn update_session_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE chat_sessions SET cached_summary = ?1 WHERE id = ?2",
            params![summary, id],
        ).map_err(|e| format!("Failed to update session summary: {}", e))?;
        Ok(())
    }

    pub fn delete_sessions_by_worktree(&self, worktree_session_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        // CASCADE deletes messages automatically
        conn.execute(
            "DELETE FROM chat_sessions WHERE worktree_session_id = ?1",
            params![worktree_session_id],
        ).map_err(|e| format!("Failed to delete worktree chat sessions: {}", e))?;
        Ok(())
    }

    pub fn delete_sessions_by_project(&self, project_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        // CASCADE deletes messages automatically
        conn.execute(
            "DELETE FROM chat_sessions WHERE project_name = ?1",
            params![project_name],
        ).map_err(|e| format!("Failed to delete project chat sessions: {}", e))?;
        Ok(())
    }
}
