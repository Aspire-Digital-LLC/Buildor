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

pub fn get_base_url() -> &'static str {
    SDK_BASE_URL.get_or_init(|| {
        let port = std::env::var("BUILDOR_SDK_PORT").unwrap_or_else(|_| "3456".to_string());
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
    disallowed_tools: Vec<String>,
) -> Result<CreateSessionResponse, String> {
    let url = format!("{}/sessions", get_base_url());
    let body = serde_json::json!({
        "cwd": cwd,
        "model": model,
        "systemPrompt": system_prompt,
        "permissionMode": permission_mode,
        "disallowedTools": disallowed_tools,
    });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SDK create_session request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK create_session failed ({}): {}", status, text));
    }
    resp.json::<CreateSessionResponse>()
        .await
        .map_err(|e| format!("SDK create_session parse failed: {}", e))
}

pub async fn send_message(session_id: &str, text: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}/message", get_base_url(), session_id);
    let body = serde_json::json!({ "text": text });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SDK send_message request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK send_message failed ({}): {}", status, text));
    }
    Ok(())
}

pub async fn send_message_with_images(
    session_id: &str,
    text: &str,
    images: Vec<serde_json::Value>,
) -> Result<(), String> {
    let url = format!("{}/sessions/{}/message", get_base_url(), session_id);
    let body = serde_json::json!({ "text": text, "images": images });
    let resp = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SDK send_message_with_images request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK send_message_with_images failed ({}): {}", status, text));
    }
    Ok(())
}

pub async fn send_permission(
    session_id: &str,
    request_id: &str,
    approved: bool,
    always_allow: bool,
) -> Result<(), String> {
    let url = format!("{}/sessions/{}/permission", get_base_url(), session_id);
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
        .map_err(|e| format!("SDK send_permission request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK send_permission failed ({}): {}", status, text));
    }
    Ok(())
}

pub async fn interrupt(session_id: &str) -> Result<(), String> {
    let url = format!("{}/sessions/{}/interrupt", get_base_url(), session_id);
    let resp = client()
        .post(&url)
        .send()
        .await
        .map_err(|e| format!("SDK interrupt request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK interrupt failed ({}): {}", status, text));
    }
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
    let resp = client()
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("SDK delete_session request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK delete_session failed ({}): {}", status, text));
    }
    Ok(())
}

pub async fn list_sessions() -> Result<Vec<SdkSessionInfo>, String> {
    let url = format!("{}/sessions", get_base_url());
    let resp = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SDK list_sessions request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK list_sessions failed ({}): {}", status, text));
    }
    resp.json::<Vec<SdkSessionInfo>>()
        .await
        .map_err(|e| format!("SDK list_sessions parse failed: {}", e))
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
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("SDK health_check failed ({}): {}", status, text));
    }
    resp.json::<HealthResponse>()
        .await
        .map_err(|e| format!("SDK health_check parse failed: {}", e))
}

pub fn stream_url(session_id: &str) -> String {
    format!("{}/sessions/{}/stream", get_base_url(), session_id)
}
