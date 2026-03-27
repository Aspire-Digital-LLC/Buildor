use std::process::Command;

#[tauri::command]
pub async fn generate_slug(description: String) -> Result<String, String> {
    let prompt = format!(
        "TASK: Convert this text into a git branch slug.\n\
        RULES:\n\
        - Output ONLY the slug. No explanation, no questions, no commentary.\n\
        - 2-5 words maximum, lowercase, separated by hyphens.\n\
        - No special characters. Only a-z, 0-9, and hyphens.\n\
        - Capture the intent even if the description is incomplete or has typos.\n\
        - If the text is vague, make your best guess.\n\
        - NEVER ask for clarification. NEVER output anything except the slug.\n\n\
        Examples:\n\
        Input: \"Add dark mode toggle to settings\" -> dark-mode-toggle\n\
        Input: \"fix the login bug on iOS\" -> fix-ios-login-bug\n\
        Input: \"We need to change the app name to\" -> rename-app\n\
        Input: \"Issue #54\" -> issue-54\n\
        Input: \"refactor auth middleware because of compliance\" -> refactor-auth-middleware\n\n\
        Input: \"{}\"\n\
        Output:",
        description
    );

    let output = Command::new("claude")
        .args([
            "--print",
            "--model", "haiku",
            &prompt,
        ])
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    if output.status.success() {
        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // Take only the first line (ignore any extra commentary)
        let first_line = raw.lines().next().unwrap_or("").trim();

        let slug = first_line
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != ' ', "")
            .trim()
            .replace(' ', "-")
            .replace("--", "-")
            .trim_matches('-')
            .to_string();

        // If slug is too long, Haiku didn't follow instructions — truncate to first 5 words
        let slug = if slug.len() > 50 {
            slug.splitn(6, '-').take(5).collect::<Vec<_>>().join("-")
        } else {
            slug
        };

        if slug.is_empty() {
            return Err("Haiku returned empty slug".to_string());
        }
        Ok(slug)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Claude failed: {}", stderr.trim()))
    }
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
