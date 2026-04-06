use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

pub fn connect_sse_bridge(app: AppHandle, sdk_session_id: String, tauri_session_id: String) {
    tauri::async_runtime::spawn(async move {
        let url = crate::sdk_client::stream_url(&sdk_session_id);
        let output_event = format!("claude-output-{}", tauri_session_id);
        let exit_event = format!("claude-exit-{}", tauri_session_id);

        eprintln!("[SSE] Connecting to {} for tauri session {}", url, tauri_session_id);

        // Use a dedicated client without timeout — SSE is a long-lived stream
        let sse_client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let resp = match sse_client
            .get(&url)
            .header("Accept", "text/event-stream")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[SSE] Connection error for {}: {}", tauri_session_id, e);
                let _ = app.emit(&exit_event, "exited");
                return;
            }
        };

        eprintln!("[SSE] Connected, status={} for {}", resp.status(), tauri_session_id);

        if !resp.status().is_success() {
            eprintln!("[SSE] Non-success status for {}: {}", tauri_session_id, resp.status());
            let _ = app.emit(&exit_event, "exited");
            return;
        }

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut current_event = String::new();
        let mut current_data = String::new();

        let mut slow_emit_count: u64 = 0;
        let mut total_emit_ms: u64 = 0;
        let mut line_count: u64 = 0;

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("SSE stream error for {}: {}", tauri_session_id, e);
                    break;
                }
            };

            let text = match std::str::from_utf8(&chunk) {
                Ok(t) => t,
                Err(_) => continue,
            };

            buffer.push_str(text);

            while let Some(pos) = buffer.find("\n\n") {
                let frame = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                current_event.clear();
                current_data.clear();

                for line in frame.lines() {
                    if line.starts_with(':') {
                        // SSE comment, ignore
                        continue;
                    } else if let Some(value) = line.strip_prefix("event:") {
                        current_event = value.trim().to_string();
                    } else if let Some(value) = line.strip_prefix("data:") {
                        if !current_data.is_empty() {
                            current_data.push('\n');
                        }
                        current_data.push_str(value.strip_prefix(' ').unwrap_or(value));
                    }
                }

                if current_event == "claude-output" && !current_data.is_empty() {
                    let t0 = std::time::Instant::now();
                    let _ = app.emit(&output_event, &current_data);
                    let elapsed_ms = t0.elapsed().as_millis() as u64;
                    line_count += 1;
                    total_emit_ms += elapsed_ms;
                    if elapsed_ms > 50 {
                        slow_emit_count += 1;
                        if let Ok(db) = crate::logging::get_log_db() {
                            let _ = db.insert(&crate::logging::db::LogEntry {
                                id: None,
                                session_id: Some(tauri_session_id.clone()),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                end_timestamp: None,
                                duration_ms: Some(elapsed_ms as i64),
                                repo: None,
                                function_area: "claude-chat".to_string(),
                                level: "warn".to_string(),
                                operation: "sse-emit-slow".to_string(),
                                message: format!(
                                    "emit took {}ms (line #{}, slow #{})",
                                    elapsed_ms, line_count, slow_emit_count
                                ),
                                details: None,
                            });
                        }
                    }
                } else if current_event == "claude-exit" {
                    // Log summary before exiting
                    if let Ok(db) = crate::logging::get_log_db() {
                        let _ = db.insert(&crate::logging::db::LogEntry {
                            id: None,
                            session_id: Some(tauri_session_id.clone()),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            end_timestamp: None,
                            duration_ms: Some(total_emit_ms as i64),
                            repo: None,
                            function_area: "claude-chat".to_string(),
                            level: "info".to_string(),
                            operation: "sse-emit-summary".to_string(),
                            message: format!(
                                "{} lines, {} slow emits (>50ms), total emit time: {}ms, avg: {:.1}ms",
                                line_count,
                                slow_emit_count,
                                total_emit_ms,
                                if line_count > 0 {
                                    total_emit_ms as f64 / line_count as f64
                                } else {
                                    0.0
                                }
                            ),
                            details: None,
                        });
                    }
                    let _ = app.emit(&exit_event, "exited");
                    return;
                }
            }
        }

        // Stream ended (connection closed or error) — log summary and emit exit
        if let Ok(db) = crate::logging::get_log_db() {
            let _ = db.insert(&crate::logging::db::LogEntry {
                id: None,
                session_id: Some(tauri_session_id.clone()),
                timestamp: chrono::Utc::now().to_rfc3339(),
                end_timestamp: None,
                duration_ms: Some(total_emit_ms as i64),
                repo: None,
                function_area: "claude-chat".to_string(),
                level: "info".to_string(),
                operation: "sse-emit-summary".to_string(),
                message: format!(
                    "{} lines, {} slow emits (>50ms), total emit time: {}ms, avg: {:.1}ms",
                    line_count,
                    slow_emit_count,
                    total_emit_ms,
                    if line_count > 0 {
                        total_emit_ms as f64 / line_count as f64
                    } else {
                        0.0
                    }
                ),
                details: None,
            });
        }
        let _ = app.emit(&exit_event, "exited");
    });
}
