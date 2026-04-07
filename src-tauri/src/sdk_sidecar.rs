use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

static SIDECAR_PROCESS: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();

fn sidecar_lock() -> &'static Mutex<Option<std::process::Child>> {
    SIDECAR_PROCESS.get_or_init(|| Mutex::new(None))
}

pub fn start_sidecar() -> Result<(), String> {
    let mut guard = sidecar_lock()
        .lock()
        .map_err(|e| format!("Failed to lock sidecar mutex: {}", e))?;

    if guard.is_some() {
        return Ok(()); // already running
    }

    let port = std::env::var("BUILDOR_SDK_PORT").unwrap_or_else(|_| "3456".to_string());

    let mut cmd = crate::no_window_command("node");
    cmd.args(["--import", "tsx", "src/index.ts"])
        .env("BUILDOR_SDK_PORT", &port)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    // Set current_dir to the sdk-service directory where tsx is installed
    // CARGO_MANIFEST_DIR is only available at compile time via env!() macro
    if cfg!(debug_assertions) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let sdk_service_dir = std::path::Path::new(manifest_dir).join("sdk-service");
        cmd.current_dir(&sdk_service_dir);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn SDK sidecar: {}", e))?;

    *guard = Some(child);
    Ok(())
}

pub fn stop_sidecar() {
    if let Ok(mut guard) = sidecar_lock().lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Synchronous health check polling — safe to call from setup() before Tokio runtime is available.
pub fn wait_for_healthy(timeout_ms: u64) -> Result<(), String> {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    let url = format!("{}/health", crate::sdk_client::get_base_url());

    // Use a blocking HTTP client since we can't use async here
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to create blocking client: {}", e))?;

    loop {
        if start.elapsed() >= timeout {
            return Err(format!(
                "SDK sidecar did not become healthy within {}ms",
                timeout_ms
            ));
        }

        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                return Ok(());
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

pub fn start_health_loop(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut consecutive_failures: u32 = 0;

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;

            match crate::sdk_client::health_check().await {
                Ok(_) => {
                    consecutive_failures = 0;
                }
                Err(e) => {
                    consecutive_failures += 1;
                    if consecutive_failures >= 3 {
                        // Log the restart attempt
                        if let Ok(db) = crate::logging::get_log_db() {
                            let _ = db.insert(&crate::logging::db::LogEntry {
                                id: None,
                                session_id: None,
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                end_timestamp: None,
                                duration_ms: None,
                                repo: None,
                                function_area: "claude-chat".to_string(),
                                level: "warn".to_string(),
                                operation: "sdk-sidecar-restart".to_string(),
                                message: format!(
                                    "SDK sidecar health check failed {} consecutive times ({}), restarting",
                                    consecutive_failures, e
                                ),
                                details: None,
                            });
                        }

                        match restart_sidecar().await {
                            Ok(_) => {
                                consecutive_failures = 0;
                                let _ = app.emit("sdk-sidecar-restarted", "ok");
                            }
                            Err(e) => {
                                if let Ok(db) = crate::logging::get_log_db() {
                                    let _ = db.insert(&crate::logging::db::LogEntry {
                                        id: None,
                                        session_id: None,
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        end_timestamp: None,
                                        duration_ms: None,
                                        repo: None,
                                        function_area: "claude-chat".to_string(),
                                        level: "error".to_string(),
                                        operation: "sdk-sidecar-restart".to_string(),
                                        message: format!("Failed to restart SDK sidecar: {}", e),
                                        details: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

pub async fn restart_sidecar() -> Result<(), String> {
    stop_sidecar();
    start_sidecar()?;
    // Run blocking health check in a thread to avoid blocking the async runtime
    tokio::task::spawn_blocking(|| wait_for_healthy(10000))
        .await
        .map_err(|e| format!("Health check task failed: {}", e))?
}
