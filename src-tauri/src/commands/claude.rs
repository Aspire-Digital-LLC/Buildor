use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};

static SESSIONS: std::sync::OnceLock<Mutex<HashMap<String, ClaudeSession>>> = std::sync::OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<String, ClaudeSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct ClaudeSession {
    working_dir: String,
    is_first_message: bool,
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

/// Claude sessions use --print --continue for each message.
/// The session_id maps to a working directory. Each send_message
/// spawns `claude --print --continue "<message>"` and streams output.

// (ClaudeSession struct defined below get_sessions)

#[tauri::command]
pub async fn start_session(_app: AppHandle, working_dir: String) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id.clone(), ClaudeSession {
        working_dir,
        is_first_message: true,
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn send_message(app: AppHandle, session_id: String, message: String) -> Result<(), String> {
    let working_dir;
    let is_first;
    {
        let sessions = get_sessions();
        let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get_mut(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        working_dir = session.working_dir.clone();
        is_first = session.is_first_message;
        session.is_first_message = false;
    }

    // Build args: --print for non-interactive, --continue for subsequent messages
    // --dangerously-skip-permissions because --print mode has no interactive approval
    let mut args = vec![
        "--print".to_string(),
        "--dangerously-skip-permissions".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    if !is_first {
        args.push("--continue".to_string());
    }
    args.push(message);

    let sid = session_id.clone();
    let app_handle = app.clone();

    // Spawn in background thread to not block
    thread::spawn(move || {
        let child = Command::new("claude")
            .args(&args)
            .current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        match child {
            Ok(mut child) => {
                if let Some(stdout) = child.stdout.take() {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        let _ = app_handle.emit(&format!("claude-output-{}", sid), line);
                    }
                }
                if let Some(stderr) = child.stderr.take() {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().flatten() {
                        let _ = app_handle.emit(&format!("claude-output-{}", sid), line);
                    }
                }
                let _ = child.wait();
                let _ = app_handle.emit(&format!("claude-done-{}", sid), "done");
            }
            Err(e) => {
                let _ = app_handle.emit(&format!("claude-output-{}", sid), format!("Error: {}", e));
                let _ = app_handle.emit(&format!("claude-done-{}", sid), "error");
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_session(session_id: String) -> Result<(), String> {
    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.remove(&session_id);
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
