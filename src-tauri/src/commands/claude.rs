use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};
use serde::{Serialize, Deserialize};

static SESSIONS: std::sync::OnceLock<Mutex<HashMap<String, ClaudeSession>>> = std::sync::OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<String, ClaudeSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct ClaudeSession {
    stdin: std::process::ChildStdin,
    #[allow(dead_code)]
    child: Child,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub session_id: String,
    pub working_dir: String,
    pub is_active: bool,
}

fn is_valid_slug(s: &str) -> bool {
    if s.is_empty() || s.len() > 60 {
        return false;
    }
    if !s.contains('-') {
        return false;
    }
    if !s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return false;
    }
    if s.contains("--") || s.starts_with('-') || s.ends_with('-') {
        return false;
    }
    let word_count = s.split('-').count();
    word_count >= 2 && word_count <= 6
}

fn clean_response(raw: &str) -> String {
    let first_line = raw.lines().next().unwrap_or("").trim();
    first_line
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != ' ', "")
        .trim()
        .replace(' ', "-")
        .replace("--", "-")
        .trim_matches('-')
        .to_string()
}

fn call_haiku(prompt: &str) -> Result<String, String> {
    let output = Command::new("claude")
        .args(["--print", "--model", "haiku", prompt])
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Claude failed: {}", stderr.trim()))
    }
}

#[tauri::command]
pub async fn generate_slug(description: String) -> Result<String, String> {
    let initial_prompt = format!(
        "TASK: Convert this text into a git branch slug.\n\
        RULES:\n\
        - Output ONLY the slug. No explanation, no questions, no commentary.\n\
        - 2-5 words, lowercase, separated by hyphens. Example format: fix-login-bug\n\
        - Only a-z, 0-9, and hyphens allowed.\n\
        - Capture the intent even if the description is incomplete or has typos.\n\
        - NEVER ask for clarification. NEVER output anything except the slug.\n\n\
        Examples:\n\
        Input: \"Add dark mode toggle to settings\" -> dark-mode-toggle\n\
        Input: \"fix the login bug on iOS\" -> fix-ios-login-bug\n\
        Input: \"We need to change the app name to\" -> rename-app\n\
        Input: \"Issue #54\" -> issue-54-fix\n\
        Input: \"refactor auth middleware because of compliance\" -> refactor-auth-middleware\n\n\
        Input: \"{}\"\n\
        Output:",
        description
    );

    let retry_prompt = |bad_response: &str| -> String {
        format!(
            "Your previous response \"{}\" did not follow instructions.\n\
            I need ONLY a git branch slug: 2-5 lowercase words separated by hyphens.\n\
            Example: fix-login-bug\n\
            No sentences, no questions, no explanation.\n\
            The description was: \"{}\"\n\
            Output ONLY the slug:",
            bad_response, description
        )
    };

    // Attempt 1
    let raw = call_haiku(&initial_prompt)?;
    let slug = clean_response(&raw);
    if is_valid_slug(&slug) {
        return Ok(slug);
    }

    // Attempt 2
    let raw2 = call_haiku(&retry_prompt(&raw))?;
    let slug2 = clean_response(&raw2);
    if is_valid_slug(&slug2) {
        return Ok(slug2);
    }

    // Attempt 3
    let raw3 = call_haiku(&retry_prompt(&raw2))?;
    let slug3 = clean_response(&raw3);
    if is_valid_slug(&slug3) {
        return Ok(slug3);
    }

    Err(format!(
        "Failed to generate valid slug after 3 attempts. Last response: \"{}\"",
        raw3
    ))
}

#[tauri::command]
pub async fn start_session(app: AppHandle, working_dir: String) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let mut child = Command::new("claude")
        .current_dir(&working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;
    let stdin = child.stdin.take()
        .ok_or_else(|| "Failed to capture stdin".to_string())?;

    let sid = session_id.clone();

    // Stream stdout to frontend via events
    let app_handle = app.clone();
    let sid_stdout = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app_handle.emit(&format!("claude-output-{}", sid_stdout), text);
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit(&format!("claude-exit-{}", sid_stdout), "exited");
    });

    // Stream stderr too
    let app_handle2 = app.clone();
    let sid_stderr = sid.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app_handle2.emit(&format!("claude-output-{}", sid_stderr), text);
                }
                Err(_) => break,
            }
        }
    });

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id.clone(), ClaudeSession { stdin, child });

    Ok(session_id)
}

#[tauri::command]
pub async fn send_message(session_id: String, message: String) -> Result<(), String> {
    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    let session = map.get_mut(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    writeln!(session.stdin, "{}", message)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    session.stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn stop_session(session_id: String) -> Result<(), String> {
    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    if let Some(mut session) = map.remove(&session_id) {
        let _ = session.child.kill();
    }

    Ok(())
}

#[tauri::command]
pub async fn get_session_status(session_id: String) -> Result<String, String> {
    let sessions = get_sessions();
    let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;

    if map.contains_key(&session_id) {
        Ok("active".to_string())
    } else {
        Ok("inactive".to_string())
    }
}

#[tauri::command]
pub async fn list_claude_sessions() -> Result<Vec<String>, String> {
    let sessions = get_sessions();
    let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(map.keys().cloned().collect())
}
