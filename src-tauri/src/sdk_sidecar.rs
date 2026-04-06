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
    cmd.args(["--import", "tsx", "src-tauri/sdk-service/src/index.ts"])
        .env("BUILDOR_SDK_PORT", &port)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());

    // In dev mode, set current_dir to the project root (parent of src-tauri/)
    if cfg!(debug_assertions) {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            if let Some(project_root) = std::path::Path::new(&manifest_dir).parent() {
                cmd.current_dir(project_root);
            }
        }
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

pub async fn wait_for_healthy(timeout_ms: u64) -> Result<(), String> {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);

    loop {
        if start.elapsed() >= timeout {
            return Err(format!(
                "SDK sidecar did not become healthy within {}ms",
                timeout_ms
            ));
        }

        match crate::sdk_client::health_check().await {
            Ok(_) => return Ok(()),
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }
}

pub fn start_health_loop(app: tauri::AppHandle) {
    tokio::spawn(async move {
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
    wait_for_healthy(10000).await
}
