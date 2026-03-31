use crate::logging::db::{ChatSession, ChatMessageRecord};
use crate::logging::get_log_db;

#[tauri::command]
pub async fn create_chat_session(
    id: String,
    project_name: String,
    repo_path: String,
    worktree_session_id: Option<String>,
    branch_name: String,
) -> Result<ChatSession, String> {
    let db = get_log_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    let session = ChatSession {
        id: id.clone(),
        project_name,
        repo_path,
        worktree_session_id,
        branch_name,
        title: None,
        started_at: now,
        ended_at: None,
        message_count: 0,
        cached_summary: None,
    };
    db.insert_chat_session(&session)?;
    Ok(session)
}

#[tauri::command]
pub async fn end_chat_session(session_id: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.end_chat_session(&session_id)
}

#[tauri::command]
pub async fn save_chat_message(
    session_id: String,
    seq: i64,
    role: String,
    content_json: String,
    model: Option<String>,
    cost_usd: Option<f64>,
    duration_ms: Option<i64>,
    is_result: Option<bool>,
) -> Result<i64, String> {
    let db = get_log_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    let msg = ChatMessageRecord {
        id: None,
        session_id,
        seq,
        role,
        content_json,
        model,
        cost_usd,
        duration_ms,
        is_result: is_result.unwrap_or(false),
        created_at: now,
    };
    db.insert_chat_message(&msg)
}

#[tauri::command]
pub async fn list_chat_sessions(
    project_name: String,
    worktree_session_id: Option<String>,
) -> Result<Vec<ChatSession>, String> {
    let db = get_log_db()?;
    db.query_chat_sessions(&project_name, worktree_session_id.as_deref())
}

#[tauri::command]
pub async fn get_chat_messages(
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ChatMessageRecord>, String> {
    let db = get_log_db()?;
    db.query_chat_messages(&session_id, limit.unwrap_or(10000), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn update_chat_session_title(session_id: String, title: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.update_session_title(&session_id, &title)
}

#[tauri::command]
pub async fn update_chat_session_summary(session_id: String, summary: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.update_session_summary(&session_id, &summary)
}

#[tauri::command]
pub async fn generate_chat_title(session_id: String) -> Result<String, String> {
    let db = get_log_db()?;
    // Read first 5 messages
    let messages = db.query_chat_messages(&session_id, 5, 0)?;
    if messages.is_empty() {
        return Err("No messages to generate title from".to_string());
    }

    // Build a condensed transcript for the title prompt
    let transcript: String = messages.iter().map(|m| {
        let role = match m.role.as_str() {
            "user" => "User",
            "assistant" => "Assistant",
            _ => &m.role,
        };
        // Extract text from content_json (best-effort)
        let text = extract_text_from_content(&m.content_json);
        format!("{}: {}", role, truncate_str(&text, 200))
    }).collect::<Vec<_>>().join("\n");

    let prompt = format!(
        "TASK: Generate a short title (under 8 words) for this conversation.\n\
        RULES:\n\
        - Output ONLY the title. No quotes, no explanation.\n\
        - Under 8 words. Be specific and descriptive.\n\
        - Capture the main topic or goal.\n\n\
        Conversation:\n{}\n\nTitle:",
        transcript
    );

    let raw = super::claude::call_haiku(&prompt)?;
    let title = raw.lines().next().unwrap_or("").trim().trim_matches('"').to_string();
    let title = if title.split_whitespace().count() > 8 {
        title.split_whitespace().take(8).collect::<Vec<_>>().join(" ")
    } else {
        title
    };

    db.update_session_title(&session_id, &title)?;
    Ok(title)
}

#[tauri::command]
pub async fn generate_chat_summary(session_id: String) -> Result<String, String> {
    let db = get_log_db()?;

    // Check cached summary first
    let sessions = db.query_chat_sessions_by_id(&session_id)?;
    if let Some(ref summary) = sessions.cached_summary {
        return Ok(summary.clone());
    }

    // Read all messages
    let messages = db.query_chat_messages(&session_id, 10000, 0)?;
    if messages.is_empty() {
        return Err("No messages to summarize".to_string());
    }

    // Build transcript
    let transcript: String = messages.iter().map(|m| {
        let role = match m.role.as_str() {
            "user" => "User",
            "assistant" => "Assistant",
            _ => &m.role,
        };
        let text = extract_text_from_content(&m.content_json);
        format!("{}: {}", role, truncate_str(&text, 500))
    }).collect::<Vec<_>>().join("\n");

    // Truncate transcript to ~20K chars for the summary prompt
    let truncated = truncate_str(&transcript, 20000);

    let prompt = format!(
        "TASK: Summarize this conversation concisely.\n\
        RULES:\n\
        - Output ONLY the summary. No preamble.\n\
        - Cover the key topics, decisions, and outcomes.\n\
        - Be concise but thorough — capture important details.\n\
        - Use bullet points for clarity.\n\n\
        Conversation:\n{}\n\nSummary:",
        truncated
    );

    let summary = super::claude::call_haiku(&prompt)?;
    db.update_session_summary(&session_id, &summary)?;
    Ok(summary)
}

#[tauri::command]
pub async fn delete_chat_session(session_id: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.delete_chat_session(&session_id)
}

#[tauri::command]
pub async fn delete_chat_history_for_worktree(worktree_session_id: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.delete_sessions_by_worktree(&worktree_session_id)
}

#[tauri::command]
pub async fn delete_chat_history_for_project(project_name: String) -> Result<(), String> {
    let db = get_log_db()?;
    db.delete_sessions_by_project(&project_name)
}

// --- Helper functions ---

fn extract_text_from_content(content_json: &str) -> String {
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(content_json) {
        arr.iter()
            .filter_map(|block| {
                if block.get("type")?.as_str()? == "text" {
                    block.get("text")?.as_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        // Might be a plain string
        content_json.to_string()
    }
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}
