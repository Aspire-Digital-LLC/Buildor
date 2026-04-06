use std::collections::HashMap;
use std::sync::Mutex;

static TELEMETRY_SUBSCRIBERS: std::sync::OnceLock<Mutex<HashMap<String, TelemetrySubscription>>> =
    std::sync::OnceLock::new();

pub struct TelemetrySubscription {
    pub session_id: String,
    pub streams: Vec<String>,
    pub subscribed_at: String,
}

fn get_subscribers() -> &'static Mutex<HashMap<String, TelemetrySubscription>> {
    TELEMETRY_SUBSCRIBERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn has_subscribers() -> bool {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => !map.is_empty(),
        Err(_) => false,
    }
}

pub fn get_pool_subscribers() -> Vec<String> {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => map
            .values()
            .filter(|s| s.streams.contains(&"pool".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn get_mailbox_subscribers() -> Vec<String> {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => map
            .values()
            .filter(|s| s.streams.contains(&"mailbox".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn subscribe(session_id: String, streams: Vec<String>) {
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
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
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
        map.remove(session_id);
    }
}

/// Remove subscriptions for sessions that no longer exist.
pub fn cleanup_dead_subscribers() {
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
        let active_sessions: Vec<String> = {
            match crate::commands::claude::session_exists_list() {
                Some(list) => list,
                None => return,
            }
        };
        map.retain(|sid, _| active_sessions.contains(sid));
    }
}
