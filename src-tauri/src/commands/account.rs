use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::config::app_config::AppConfig;

/// Open a webview window to claude.ai/login for authentication
#[tauri::command]
pub async fn open_login_window(app: AppHandle) -> Result<(), String> {
    let label = "claude-login";

    // Focus existing window if open
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_focus();
        return Ok(());
    }

    // Open to / — if already logged in, stays on claude.ai; if not, redirects to /login
    let url = WebviewUrl::External("https://claude.ai/".parse().unwrap());

    let _win = WebviewWindowBuilder::new(&app, label, url)
        .title("Sign in to Claude")
        .inner_size(500.0, 700.0)
        .center()
        .build()
        .map_err(|e| format!("Failed to open login window: {}", e))?;

    // Strategy: poll URL. Once not on /login, navigate to API endpoints directly.
    // The webview sends cookies automatically, so the API responds with JSON.
    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));

        let mut phase = 0; // 0=wait for login, 1=fetching orgs, 2=fetching usage
        let mut org_id: Option<String> = None;

        for _ in 0..150 {
            let Some(win) = app_handle.get_webview_window("claude-login") else {
                break;
            };

            match phase {
                0 => {
                    // Phase 0: Wait for login — try navigating to org list API
                    // If user is logged in, this returns JSON. If not, it redirects to login.
                    let api_url: tauri::Url = "https://claude.ai/api/organizations".parse().unwrap();
                    let _ = win.navigate(api_url);
                    phase = 1;
                    std::thread::sleep(std::time::Duration::from_secs(3));
                }
                1 => {
                    // Phase 1: Extract UUID from org list page
                    // Use location.hash to communicate (document.title doesn't sync to native title)
                    let _ = win.eval(r#"
                        try {
                            var text = document.body?.innerText || '';
                            var match = text.match(/"uuid"\s*:\s*"([a-f0-9-]{36})"/);
                            if (match) {
                                window.location.hash = 'buildor_org_' + match[1];
                            }
                        } catch(e) {}
                    "#);
                    std::thread::sleep(std::time::Duration::from_millis(800));

                    if let Ok(url) = win.url() {
                        let url_str = url.as_str();
                        if let Some(pos) = url_str.find("#buildor_org_") {
                            let id = url_str[pos + 13..].to_string();
                            org_id = Some(id.clone());
                            let usage_url: tauri::Url = format!(
                                "https://claude.ai/api/organizations/{}/usage", id
                            ).parse().unwrap();
                            let _ = win.navigate(usage_url);
                            phase = 2;
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            continue;
                        } else if url_str.contains("/login") {
                            phase = 0;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(2));
                }
                2 => {
                    // Phase 2: Read usage JSON via hash
                    let _ = win.eval(r#"
                        try {
                            var text = (document.body?.innerText || '').trim();
                            if (text.startsWith('{') && text.includes('utilization')) {
                                window.location.hash = 'buildor_usage_' + encodeURIComponent(text);
                            }
                        } catch(e) {}
                    "#);
                    std::thread::sleep(std::time::Duration::from_millis(800));

                    if let Ok(url) = win.url() {
                        let url_str = url.as_str();
                        if let Some(pos) = url_str.find("#buildor_usage_") {
                            let encoded = &url_str[pos + 15..];
                            if let Ok(usage_json) = urlencoding::decode(encoded) {
                                let oid = org_id.clone().unwrap_or_default();
                                let result = format!(
                                    r#"{{"orgId":"{}","usage":{}}}"#,
                                    oid, usage_json
                                );
                                if let Err(e) = store_session_data(&result) {
                                    eprintln!("Failed to store: {}", e);
                                }
                                let _ = app_handle.emit("login-complete", result);
                                let _ = win.close();
                                return;
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
                _ => break,
            }
        }

        // Timeout — close window
        if let Some(win) = app_handle.get_webview_window("claude-login") {
            let _ = win.close();
        }
    });

    Ok(())
}

/// Store org ID and usage data fetched from inside the webview
fn store_session_data(json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse session data: {}", e))?;

    let config_dir = AppConfig::data_dir();

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let session_data = serde_json::json!({
        "orgId": data["orgId"],
        "usage": data["usage"],
        "loggedIn": true,
        "capturedAt": chrono::Utc::now().to_rfc3339(),
    });

    let path = config_dir.join("claude_session.json");
    std::fs::write(&path, serde_json::to_string_pretty(&session_data).unwrap())
        .map_err(|e| format!("Failed to write session: {}", e))?;

    Ok(())
}

/// Fetch usage data — returns stored usage from last login/refresh
#[tauri::command]
pub async fn fetch_claude_usage() -> Result<String, String> {
    let config_dir = AppConfig::data_dir();

    let session_path = config_dir.join("claude_session.json");
    if !session_path.exists() {
        return Err("No session stored. Please log in first.".to_string());
    }

    let content = std::fs::read_to_string(&session_path)
        .map_err(|e| format!("Failed to read session: {}", e))?;
    let session: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session: {}", e))?;

    // Return the stored usage data
    if let Some(usage) = session.get("usage") {
        Ok(serde_json::to_string(usage).unwrap_or_else(|_| "{}".to_string()))
    } else {
        Err("No usage data. Please log in again to refresh.".to_string())
    }
}

/// Start persistent usage polling — hidden webview that fetches every 60s
#[tauri::command]
pub async fn start_usage_polling(app: AppHandle) -> Result<(), String> {
    let label = "claude-usage-poller";

    // Already running
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }

    // Need org ID
    let config_dir = AppConfig::data_dir();
    let session_path = config_dir.join("claude_session.json");
    if !session_path.exists() {
        return Err("No session. Please log in first.".to_string());
    }
    let content = std::fs::read_to_string(&session_path).unwrap_or_default();
    let session: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    let org_id = session["orgId"].as_str()
        .ok_or_else(|| "No org ID. Please log in again.".to_string())?
        .to_string();

    // Create a tiny hidden webview — it holds the claude.ai session cookies
    let url = WebviewUrl::External(
        format!("https://claude.ai/api/organizations/{}/usage", org_id).parse().unwrap()
    );
    let _win = WebviewWindowBuilder::new(&app, label, url)
        .title("Buildor Usage Poller")
        .inner_size(1.0, 1.0)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("Failed to create poller: {}", e))?;

    // Background thread: every 60s navigate to the usage endpoint and read the JSON
    let app_handle = app.clone();
    std::thread::spawn(move || {
        // Initial wait for page to load
        std::thread::sleep(std::time::Duration::from_secs(4));

        loop {
            if let Some(win) = app_handle.get_webview_window("claude-usage-poller") {
                // Read the JSON from the page body via URL hash trick
                let _ = win.eval(r#"
                    try {
                        var text = (document.body?.innerText || '').trim();
                        if (text.startsWith('{') && text.includes('utilization')) {
                            window.location.hash = 'buildor_usage_' + encodeURIComponent(text);
                        }
                    } catch(e) {}
                "#);

                std::thread::sleep(std::time::Duration::from_millis(800));

                if let Ok(url) = win.url() {
                    let url_str = url.as_str();
                    if let Some(pos) = url_str.find("#buildor_usage_") {
                        let encoded = &url_str[pos + 15..];
                        if let Ok(usage_json) = urlencoding::decode(encoded) {
                            let result = format!(
                                r#"{{"orgId":"{}","usage":{}}}"#,
                                org_id, usage_json
                            );
                            let _ = store_session_data(&result);
                            let _ = app_handle.emit("usage-refreshed", result);
                        }
                    }
                }

                // Navigate back to refresh (gets fresh data)
                let usage_url: tauri::Url = format!(
                    "https://claude.ai/api/organizations/{}/usage", org_id
                ).parse().unwrap();
                let _ = win.navigate(usage_url);

                // Wait 60 seconds before next poll
                std::thread::sleep(std::time::Duration::from_secs(60));
            } else {
                break; // Poller window was closed
            }
        }
    });

    Ok(())
}

/// Stop usage polling
#[tauri::command]
pub async fn stop_usage_polling(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("claude-usage-poller") {
        let _ = win.close();
    }
    Ok(())
}

/// Check if a stored session exists
#[tauri::command]
pub async fn has_claude_session() -> Result<bool, String> {
    let config_dir = AppConfig::data_dir();

    let session_path = config_dir.join("claude_session.json");
    Ok(session_path.exists())
}

/// Clear stored session (logout) — also purges webview cookies so next login is fresh
#[tauri::command]
pub async fn clear_claude_session(app: AppHandle) -> Result<(), String> {
    // 1. Stop the usage poller (it holds claude.ai session cookies)
    if let Some(win) = app.get_webview_window("claude-usage-poller") {
        let _ = win.close();
    }

    // 2. Clear webview browsing data (cookies, localStorage, sessionStorage)
    //    All Tauri webviews share one profile, so clearing from a temp webview purges all.
    let label = "buildor-logout-cleanup";
    let url = WebviewUrl::External("about:blank".parse().unwrap());
    if let Ok(tmp_win) = WebviewWindowBuilder::new(&app, label, url)
        .visible(false)
        .skip_taskbar(true)
        .inner_size(1.0, 1.0)
        .build()
    {
        let _ = tmp_win.clear_all_browsing_data();
        let _ = tmp_win.close();
    }

    // 3. Delete stored session file
    let config_dir = AppConfig::data_dir();

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
    let output = crate::no_window_command("claude")
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
