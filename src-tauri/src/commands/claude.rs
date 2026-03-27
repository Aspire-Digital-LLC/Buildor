use std::process::Command;

fn is_valid_slug(s: &str) -> bool {
    if s.is_empty() || s.len() > 60 {
        return false;
    }
    // Must contain at least one hyphen (multi-word)
    if !s.contains('-') {
        return false;
    }
    // Only lowercase alphanumeric and hyphens
    if !s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return false;
    }
    // No double hyphens, no leading/trailing hyphens
    if s.contains("--") || s.starts_with('-') || s.ends_with('-') {
        return false;
    }
    // 2-6 words
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

    // Attempt 2 — retry with correction
    // Log will happen on frontend side as warn
    let raw2 = call_haiku(&retry_prompt(&raw))?;
    let slug2 = clean_response(&raw2);
    if is_valid_slug(&slug2) {
        return Ok(slug2);
    }

    // Attempt 3 — final retry
    let raw3 = call_haiku(&retry_prompt(&raw2))?;
    let slug3 = clean_response(&raw3);
    if is_valid_slug(&slug3) {
        return Ok(slug3);
    }

    // All 3 attempts failed — return error
    Err(format!(
        "Failed to generate valid slug after 3 attempts. Last response: \"{}\"",
        raw3
    ))
}

#[tauri::command]
pub async fn start_session(working_dir: String) -> Result<String, String> {
    // TODO: Spawn Claude Code process for working_dir
    Ok("stub-session-id".to_string())
}

#[tauri::command]
pub async fn send_message(session_id: String, message: String) -> Result<String, String> {
    // TODO: Send message to Claude Code session
    Ok("stub: response".to_string())
}

#[tauri::command]
pub async fn get_session_status(session_id: String) -> Result<String, String> {
    // TODO: Check if session is active
    Ok("active".to_string())
}
