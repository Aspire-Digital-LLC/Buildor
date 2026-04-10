use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

static SDK_BASE_URL: OnceLock<String> = OnceLock::new();
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkSessionInfo {
    pub session_id: String,
    pub pid: Option<u32>,
    pub cwd: String,
    pub model: String,
    pub started_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub sessions: u32,
    pub uptime: u64,
    pub memory_mb: Option<f64>,
}

/// Default SDK port: 3457 for dev builds, 3456 for release.
/// Overridable via BUILDOR_SDK_PORT env var.
pub fn default_sdk_port() -> &'static str {
    if cfg!(debug_assertions) { "3457" } else { "3456" }
}

pub fn get_base_url() -> &'static str {
    SDK_BASE_URL.get_or_init(|| {
        // Dev builds always use the compiled-in port — env var override is release-only
        // to prevent dev from silently connecting to the release sidecar.
        let port = if cfg!(debug_assertions) {
            default_sdk_port().to_string()
        } else {
            std::env::var("BUILDOR_SDK_PORT")
                .unwrap_or_else(|_| default_sdk_port().to_string())
        };
        format!("http://localhost:{}", port)
    })
}

pub fn client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client")
    })
}

pub async fn create_session(
    cwd: &str,
    model: &str,
    system_prompt: &str,
    permission_mode: &str,
    allowed_tools: Vec<String>,
    disallowed_tools: Vec<String>,
    setting_sources: Vec<String>,
) -> Result<CreateSessionResponse, String> {
    let url = format!("{}/sessions", get_base_url());
    let body = serde_json::json!({
        "cwd": cwd,
        "model": model,
        "systemPrompt": system_prompt,
        "permissionMode": permission_mode,
        "allowedTools": allowed_tools,
        "disallowedTools": disallowed_tools,
        "settingSources": setting_sources,
    });
    eprintln!("[sdk-client] POST {} cwd={} model={} permissionMode={}", url, cwd, model, permission_mode);
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] create_session FAILED: {}", e); format!("SDK create_session request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] create_session {} — {}", status, text);
        return Err(format!("SDK create_session failed ({}): {}", status, text));
    }
    let result = resp.json::<CreateSessionResponse>()
        .await
        .map_err(|e| format!("SDK create_session parse failed: {}", e))?;
    eprintln!("[sdk-client] create_session OK — session_id={} pid={:?}", result.session_id, result.pid);
    Ok(result)
}

pub async fn send_message(session_id: &str, text: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}/message", get_base_url(), session_id);
    let preview: String = text.chars().take(120).collect();
    eprintln!("[sdk-client] POST {} — text preview: {}", url, preview);
    let body = serde_json::json!({ "text": text });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] send_message FAILED: {}", e); format!("SDK send_message request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] send_message {} — {}", status, body_text);
        return Err(format!("SDK send_message failed ({}): {}", status, body_text));
    }
    eprintln!("[sdk-client] send_message OK ({})", status);
    Ok(())
}

pub async fn send_message_with_images(
    session_id: &str,
    text: &str,
    images: Vec<serde_json::Value>,
) -> Result<(), String> {
    let url = format!("{}/sessions/{}/message", get_base_url(), session_id);
    let preview: String = text.chars().take(120).collect();
    eprintln!("[sdk-client] POST {} — text preview: {} (images: {})", url, preview, images.len());
    let body = serde_json::json!({ "text": text, "images": images });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] send_message_with_images FAILED: {}", e); format!("SDK send_message_with_images request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] send_message_with_images {} — {}", status, body_text);
        return Err(format!("SDK send_message_with_images failed ({}): {}", status, body_text));
    }
    eprintln!("[sdk-client] send_message_with_images OK ({})", status);
    Ok(())
}

pub async fn send_permission(
    session_id: &str,
    request_id: &str,
    approved: bool,
    always_allow: bool,
) -> Result<(), String> {
    let url = format!("{}/sessions/{}/permission", get_base_url(), session_id);
    eprintln!("[sdk-client] POST {} — approved={} alwaysAllow={}", url, approved, always_allow);
    let body = serde_json::json!({
        "requestId": request_id,
        "approved": approved,
        "alwaysAllow": always_allow,
    });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] send_permission FAILED: {}", e); format!("SDK send_permission request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] send_permission {} — {}", status, body_text);
        return Err(format!("SDK send_permission failed ({}): {}", status, body_text));
    }
    eprintln!("[sdk-client] send_permission OK ({})", status);
    Ok(())
}

pub async fn interrupt(session_id: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}/interrupt", get_base_url(), session_id);
    eprintln!("[sdk-client] POST {}", url);
    let resp = client()
        .post(&url)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] interrupt FAILED: {}", e); format!("SDK interrupt request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] interrupt {} — {}", status, body_text);
        return Err(format!("SDK interrupt failed ({}): {}", status, body_text));
    }
    eprintln!("[sdk-client] interrupt OK ({})", status);
    Ok(())
}

pub async fn set_model(session_id: &str, model: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}/model", get_base_url(), session_id);
    let body = serde_json::json!({ "model": model });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SDK set_model request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK set_model failed ({}): {}", status, text));
    }
    Ok(())
}

pub async fn delete_session(session_id: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}", get_base_url(), session_id);
    eprintln!("[sdk-client] DELETE {}", url);
    let resp = client()
        .delete(&url)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] delete_session FAILED: {}", e); format!("SDK delete_session request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] delete_session {} — {}", status, body_text);
        return Err(format!("SDK delete_session failed ({}): {}", status, body_text));
    }
    eprintln!("[sdk-client] delete_session OK ({})", status);
    Ok(())
}

pub async fn list_sessions() -> Result<Vec<SdkSessionInfo>, String> {
    let url = format!("{}/sessions", get_base_url());
    let resp = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| { eprintln!("[sdk-client] list_sessions FAILED: {}", e); format!("SDK list_sessions request failed: {}", e) })?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] list_sessions {} — {}", status, body_text);
        return Err(format!("SDK list_sessions failed ({}): {}", status, body_text));
    }
    let result = resp.json::<Vec<SdkSessionInfo>>()
        .await
        .map_err(|e| format!("SDK list_sessions parse failed: {}", e))?;
    eprintln!("[sdk-client] list_sessions OK — {} sessions", result.len());
    Ok(result)
}

pub async fn health_check() -> Result<HealthResponse, String> {
    let url = format!("{}/health", get_base_url());
    let resp = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SDK health_check request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        eprintln!("[sdk-client] health_check {} — {}", status, body_text);
        return Err(format!("SDK health_check failed ({}): {}", status, body_text));
    }
    resp.json::<HealthResponse>()
        .await
        .map_err(|e| format!("SDK health_check parse failed: {}", e))
}

pub fn stream_url(session_id: &str) -> String {
    format!("{}/sessions/{}/stream", get_base_url(), session_id)
}
