use std::collections::HashMap;
use std::sync::Mutex;

static TELEMETRY_SUBSCRIBERS: std::sync::OnceLock<Mutex<HashMap<String, TelemetrySubscription>>> =
    std::sync::OnceLock::new();

pub struct TelemetrySubscription {
    pub session_id: String,
    pub streams: Vec<String>, // ["pool", "mailbox"] or subset
    pub subscribed_at: String,
}

fn get_subscribers() -> &'static Mutex<HashMap<String, TelemetrySubscription>> {
    TELEMETRY_SUBSCRIBERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn has_subscribers() -> bool {
    match get_subscribers().lock() {
        Ok(map) => !map.is_empty(),
        Err(_) => false,
    }
}

pub fn get_pool_subscribers() -> Vec<String> {
    match get_subscribers().lock() {
        Ok(map) => map
            .values()
            .filter(|s| s.streams.contains(&"pool".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn get_mailbox_subscribers() -> Vec<String> {
    match get_subscribers().lock() {
        Ok(map) => map
            .values()
            .filter(|s| s.streams.contains(&"mailbox".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn subscribe(session_id: String, streams: Vec<String>) {
    if let Ok(mut map) = get_subscribers().lock() {
        map.insert(
            session_id.clone(),
            TelemetrySubscription {
                session_id,
                streams,
                subscribed_at: chrono::Utc::now().to_rfc3339(),
            },
        );
    }
}

pub fn unsubscribe(session_id: &str) {
    if let Ok(mut map) = get_subscribers().lock() {
        map.remove(session_id);
    }
}

/// Check if a session still exists in the Claude session registry.
#[allow(dead_code)]
pub fn session_exists(session_id: &str) -> bool {
    crate::commands::claude::session_exists(session_id)
}

/// Remove subscriptions for sessions that no longer exist.
#[allow(dead_code)]
pub fn cleanup_dead_subscribers() {
    if let Ok(mut map) = get_subscribers().lock() {
        let dead: Vec<String> = map
            .keys()
            .filter(|sid| !session_exists(sid))
            .cloned()
            .collect();
        for sid in dead {
            map.remove(&sid);
        }
    }
}
