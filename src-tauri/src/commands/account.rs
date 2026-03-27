use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Open a webview window to claude.ai/login for authentication
#[tauri::command]
pub async fn open_login_window(app: AppHandle) -> Result<(), String> {
    let label = "claude-login";

    // Focus existing window if open
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::External("https://claude.ai/login".parse().unwrap());

    let _win = WebviewWindowBuilder::new(&app, label, url)
        .title("Sign in to Claude")
        .inner_size(500.0, 700.0)
        .center()
        .build()
        .map_err(|e| format!("Failed to open login window: {}", e))?;

    // Poll the webview — inject JS that writes cookies to the page title
    // (title is readable from Rust via win.title())
    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));

        for _ in 0..150 {
            if let Some(win) = app_handle.get_webview_window("claude-login") {
                // Check current URL via title trick: inject JS to set title to current cookies
                let _ = win.eval(r#"
                    (function() {
                        try {
                            var c = document.cookie || '';
                            if (c.includes('sessionKey=')) {
                                document.title = 'LOGGED_IN:' + c;
                            }
                        } catch(e) {}
                    })();
                "#);

                // Check if title has been set to cookie data
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Ok(title) = win.title() {
                    if title.starts_with("LOGGED_IN:") {
                        let cookie_str = title.trim_start_matches("LOGGED_IN:");
                        if let Err(e) = store_session_from_cookies(cookie_str) {
                            eprintln!("Failed to store session: {}", e);
                        } else {
                            let _ = app_handle.emit("login-complete", "ok");
                        }
                        // Close login window
                        let _ = win.close();
                        break;
                    }
                }
            } else {
                break; // Window closed by user
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    Ok(())
}

/// Parse cookie string and store session credentials
fn store_session_from_cookies(raw: &str) -> Result<(), String> {
    // Cookie string from document.cookie: "key=value; key2=value2"
    // Remove surrounding quotes if present
    let cleaned = raw.trim_matches('"').replace("\\\"", "\"");

    let mut session_key: Option<String> = None;
    let mut org_id: Option<String> = None;

    for part in cleaned.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            let key = key.trim();
            let value = value.trim();
            if key == "sessionKey" || key.contains("sessionKey") {
                session_key = Some(value.to_string());
            }
            if key == "lastActiveOrg" {
                org_id = Some(value.to_string());
            }
        }
    }

    // Store to ~/.buildor/claude_session.json
    let config_dir = dirs_next::data_dir()
        .or_else(dirs_next::home_dir)
        .ok_or_else(|| "Cannot find config directory".to_string())?
        .join("Buildor");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let session_data = serde_json::json!({
        "sessionKey": session_key,
        "orgId": org_id,
        "capturedAt": chrono::Utc::now().to_rfc3339(),
    });

    let path = config_dir.join("claude_session.json");
    std::fs::write(&path, serde_json::to_string_pretty(&session_data).unwrap())
        .map_err(|e| format!("Failed to write session: {}", e))?;

    Ok(())
}

/// Fetch usage data from claude.ai using stored session
#[tauri::command]
pub async fn fetch_claude_usage() -> Result<String, String> {
    // Read stored session
    let config_dir = dirs_next::data_dir()
        .or_else(dirs_next::home_dir)
        .ok_or_else(|| "Cannot find config directory".to_string())?
        .join("Buildor");

    let session_path = config_dir.join("claude_session.json");
    if !session_path.exists() {
        return Err("No session stored. Please log in first.".to_string());
    }

    let content = std::fs::read_to_string(&session_path)
        .map_err(|e| format!("Failed to read session: {}", e))?;
    let session: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session: {}", e))?;

    let session_key = session["sessionKey"].as_str()
        .ok_or_else(|| "No sessionKey in stored session".to_string())?;
    let org_id = session["orgId"].as_str()
        .ok_or_else(|| "No orgId in stored session. Please log in again.".to_string())?;

    // Call the usage API with reqwest
    let url = format!("https://claude.ai/api/organizations/{}/usage", org_id);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .header("Cookie", format!("sessionKey={}", session_key))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if status.is_success() {
        Ok(body)
    } else if status.as_u16() == 403 || status.as_u16() == 401 {
        // Session expired — delete stored session
        let _ = std::fs::remove_file(&session_path);
        Err(format!("Session expired. Please log in again. ({})", body))
    } else {
        Err(format!("Usage API error {}: {}", status, body))
    }
}

/// Check if a stored session exists
#[tauri::command]
pub async fn has_claude_session() -> Result<bool, String> {
    let config_dir = dirs_next::data_dir()
        .or_else(dirs_next::home_dir)
        .ok_or_else(|| "Cannot find config directory".to_string())?
        .join("Buildor");

    let session_path = config_dir.join("claude_session.json");
    Ok(session_path.exists())
}

/// Clear stored session (logout)
#[tauri::command]
pub async fn clear_claude_session() -> Result<(), String> {
    let config_dir = dirs_next::data_dir()
        .or_else(dirs_next::home_dir)
        .ok_or_else(|| "Cannot find config directory".to_string())?
        .join("Buildor");

    let session_path = config_dir.join("claude_session.json");
    if session_path.exists() {
        std::fs::remove_file(&session_path)
            .map_err(|e| format!("Failed to remove session: {}", e))?;
    }
    Ok(())
}

/// Also trigger `claude login` for CLI OAuth token
#[tauri::command]
pub async fn trigger_cli_login() -> Result<String, String> {
    let output = Command::new("claude")
        .args(["login"])
        .output()
        .map_err(|e| format!("Failed to run claude login: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{}\n{}", stdout, stderr).trim().to_string())
    }
}
