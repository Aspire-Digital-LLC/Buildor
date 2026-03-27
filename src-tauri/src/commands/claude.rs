use std::process::Command;

#[tauri::command]
pub async fn generate_slug(description: String) -> Result<String, String> {
    let prompt = format!(
        "Generate a short git branch slug (2-5 words, lowercase, hyphen-separated, no special characters) for this task description. Return ONLY the slug, nothing else.\n\nDescription: {}",
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
        let slug = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != '-', "")
            .replace("--", "-")
            .trim_matches('-')
            .to_string();

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
