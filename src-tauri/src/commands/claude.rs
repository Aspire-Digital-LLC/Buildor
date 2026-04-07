use std::collections::HashMap;
use std::sync::Mutex;
use tauri::AppHandle;

static SESSIONS: std::sync::OnceLock<Mutex<HashMap<String, ClaudeSession>>> = std::sync::OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<String, ClaudeSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct ClaudeSession {
    pub sdk_session_id: String,
    pub working_dir: String,
    pub pid: Option<u32>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartResult {
    pub session_id: String,
    pub pid: Option<u32>,
}

/// Check if a session exists in the registry (used by telemetry cleanup).
pub fn session_exists(session_id: &str) -> bool {
    let sessions = get_sessions();
    match sessions.lock() {
        Ok(map) => map.contains_key(session_id),
        Err(_) => false,
    }
}

/// Return list of active session IDs (used by telemetry cleanup).
pub fn session_exists_list() -> Option<Vec<String>> {
    let sessions = get_sessions();
    let map = sessions.lock().ok()?;
    Some(map.keys().cloned().collect())
}

/// Get the working directory for an existing session (used by agent spawning).
pub fn get_session_working_dir(session_id: &str) -> Option<String> {
    let sessions = get_sessions();
    let map = sessions.lock().ok()?;
    map.get(session_id).map(|s| s.working_dir.clone())
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

pub async fn call_haiku(prompt: &str) -> Result<String, String> {
    let prompt_owned = prompt.to_string();
    tokio::task::spawn_blocking(move || {
        let output = crate::no_window_command("claude")
            .args(["--print", "--model", "haiku", &prompt_owned])
            .output()
            .map_err(|e| format!("Failed to run claude: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("Claude failed: {}", stderr.trim()))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
    let raw = call_haiku(&initial_prompt).await?;
    let slug = clean_response(&raw);
    if is_valid_slug(&slug) {
        return Ok(slug);
    }

    // Attempt 2
    let raw2 = call_haiku(&retry_prompt(&raw)).await?;
    let slug2 = clean_response(&raw2);
    if is_valid_slug(&slug2) {
        return Ok(slug2);
    }

    // Attempt 3
    let raw3 = call_haiku(&retry_prompt(&raw2)).await?;
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
pub async fn start_session(app: AppHandle, working_dir: String, model: Option<String>, system_prompt: Option<String>) -> Result<SessionStartResult, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let resolved_model = model.clone().unwrap_or_else(|| "sonnet".to_string());
    let resolved_prompt = system_prompt.clone().unwrap_or_default();

    let sdk_resp = crate::sdk_client::create_session(
        &working_dir,
        &resolved_model,
        &resolved_prompt,
        "default",
        vec!["Agent".to_string()],
    ).await?;

    let pid = sdk_resp.pid;

    // Start SSE bridge to forward events to frontend
    crate::sdk_sse::connect_sse_bridge(app.clone(), sdk_resp.session_id.clone(), session_id.clone());

    // Store session
    let sessions = get_sessions();
    let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id.clone(), ClaudeSession {
        sdk_session_id: sdk_resp.session_id,
        working_dir,
        pid,
        model: Some(resolved_model),
        system_prompt: Some(resolved_prompt),
    });

    Ok(SessionStartResult { session_id, pid })
}

#[tauri::command]
pub async fn send_message(session_id: String, message: String) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.sdk_session_id.clone()
    };

    crate::sdk_client::send_message(&sdk_session_id, &message).await
}

/// Send a message with optional image attachments to Claude
/// Images are provided as objects with { media_type, data } (base64)
#[tauri::command]
pub async fn send_message_with_images(
    session_id: String,
    text: String,
    images: Vec<serde_json::Value>,
) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.sdk_session_id.clone()
    };

    crate::sdk_client::send_message_with_images(&sdk_session_id, &text, images).await
}

/// Read a file as base64 (for image attachments)
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<(String, String), String> {
    use base64::Engine;
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let media_type = match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    Ok((media_type.to_string(), b64))
}

/// Send a permission response (approve/deny) back to Claude via SDK service.
/// Both respond_to_permission and respond_to_permission_pooled are now identical
/// (direct HTTP POST). Both kept for frontend API compatibility.
#[tauri::command]
pub async fn respond_to_permission(
    session_id: String,
    request_id: String,
    approved: bool,
    _tool_input: Option<serde_json::Value>,
) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.sdk_session_id.clone()
    };

    crate::sdk_client::send_permission(&sdk_session_id, &request_id, approved, false).await
}

/// Send a permission response directly to the SDK service.
///
/// resource_key and tier are accepted for API compatibility but ignored —
/// the operation pool has been removed.
#[tauri::command]
pub async fn respond_to_permission_pooled(
    session_id: String,
    request_id: String,
    approved: bool,
    _tool_input: Option<serde_json::Value>,
    _resource_key: String,
    _tier: Option<String>,
) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.sdk_session_id.clone()
    };

    crate::sdk_client::send_permission(&sdk_session_id, &request_id, approved, false).await
}

/// Send an interrupt to stop the current turn without killing the session.
/// The session stays alive with full context preserved and prompt cache warm.
#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.sdk_session_id.clone()
    };

    crate::sdk_client::interrupt(&sdk_session_id).await
}

/// Change the model without restarting the session.
/// Preserves full context and prompt cache.
#[tauri::command]
pub async fn set_session_model(session_id: String, model: String) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get_mut(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.model = Some(model.clone());
        session.sdk_session_id.clone()
    };

    crate::sdk_client::set_model(&sdk_session_id, &model).await
}

#[tauri::command]
pub async fn stop_session(session_id: String) -> Result<(), String> {
    let sdk_session_id = {
        let sessions = get_sessions();
        let mut map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(session) = map.remove(&session_id) {
            Some(session.sdk_session_id)
        } else {
            None
        }
    };

    if let Some(sdk_sid) = sdk_session_id {
        // Best-effort delete — don't fail if service is already gone
        let _ = crate::sdk_client::delete_session(&sdk_sid).await;
    }

    // Clean up telemetry subscription
    crate::telemetry::unsubscribe(&session_id);

    Ok(())
}

/// Stop all Claude sessions whose working directory matches the given path.
/// Called by worktree close to release file locks before directory removal.
pub fn stop_sessions_in_dir(dir: &str) {
    let normalized = dir.replace('\\', "/");
    let sessions = get_sessions();
    let mut map = match sessions.lock() {
        Ok(m) => m,
        Err(_) => return,
    };

    let to_remove: Vec<(String, String)> = map.iter()
        .filter(|(_, s)| s.working_dir.replace('\\', "/") == normalized)
        .map(|(id, s)| (id.clone(), s.sdk_session_id.clone()))
        .collect();

    for (id, sdk_sid) in to_remove {
        map.remove(&id);
        crate::telemetry::unsubscribe(&id);
        // Fire-and-forget async delete
        tokio::spawn(async move {
            let _ = crate::sdk_client::delete_session(&sdk_sid).await;
        });
    }
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

/// Add a permission rule to .claude/settings.local.json in the session's working directory
#[tauri::command]
pub async fn add_permission_rule(session_id: String, rule: String) -> Result<(), String> {
    let working_dir = {
        let sessions = get_sessions();
        let map = sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = map.get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session.working_dir.clone()
    };

    let settings_path = std::path::Path::new(&working_dir)
        .join(".claude")
        .join("settings.local.json");

    // Read existing settings or create new
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Ensure permissions.allow array exists
    if settings.get("permissions").is_none() {
        settings["permissions"] = serde_json::json!({ "allow": [] });
    }
    if settings["permissions"].get("allow").is_none() {
        settings["permissions"]["allow"] = serde_json::json!([]);
    }

    // Check if rule already exists
    let allow = settings["permissions"]["allow"].as_array().unwrap_or(&vec![]).clone();
    if !allow.iter().any(|v| v.as_str() == Some(&rule)) {
        settings["permissions"]["allow"]
            .as_array_mut()
            .ok_or_else(|| "Failed to get allow array".to_string())?
            .push(serde_json::Value::String(rule));
    }

    // Write back
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .claude dir: {}", e))?;
    }
    let formatted = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&settings_path, formatted)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Read Claude credentials and config to get plan type, tier, and version
#[tauri::command]
pub async fn query_claude_status() -> Result<String, String> {
    let mut result = serde_json::json!({});

    // 1. Read ~/.claude/.credentials.json for plan/tier info
    if let Some(home) = dirs_next::home_dir() {
        let creds_path = home.join(".claude").join(".credentials.json");
        if creds_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&creds_path) {
                if let Ok(creds) = serde_json::from_str::<serde_json::Value>(&content) {
                    let oauth = &creds["claudeAiOauth"];
                    if let Some(sub_type) = oauth["subscriptionType"].as_str() {
                        result["subscriptionType"] = serde_json::Value::String(sub_type.to_string());
                    }
                    if let Some(tier) = oauth["rateLimitTier"].as_str() {
                        result["rateLimitTier"] = serde_json::Value::String(tier.to_string());
                    }
                    if let Some(scopes) = oauth["scopes"].as_array() {
                        result["scopes"] = serde_json::Value::Array(scopes.clone());
                    }
                }
            }
        }
    }

    // 2. Get claude CLI version
    if let Ok(output) = crate::no_window_command("claude").args(["--version"]).output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            result["version"] = serde_json::Value::String(version);
        }
    }

    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

/// Run a claude CLI command (e.g., login, logout) and return its output
#[tauri::command]
pub async fn run_claude_cli(args: Vec<String>) -> Result<String, String> {
    let output = crate::no_window_command("claude")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{}\n{}", stdout, stderr).trim().to_string())
    }
}

/// Insert a session into the SESSIONS map.
/// Used by agents.rs to register sessions created via sdk_client directly.
pub fn insert_session(session_id: String, session: ClaudeSession) {
    let sessions = get_sessions();
    if let Ok(mut map) = sessions.lock() {
        map.insert(session_id, session);
    }
}
