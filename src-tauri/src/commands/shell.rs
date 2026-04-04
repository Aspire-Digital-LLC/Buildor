use std::time::Duration;

use crate::no_window_command;
use crate::operation_pool::{OPERATION_POOL, Tier};

/// Derive a resource key from a shell command string and working directory.
/// Extracts the first word of the command and maps known tools to resource lanes.
fn derive_shell_resource_key(command: &str, cwd: &str) -> String {
    let first_word = command.split_whitespace().next().unwrap_or("unknown");
    match first_word {
        "git" => format!("process/git/{}", cwd),
        "npm" | "npx" => format!("process/npm/{}", cwd),
        "cargo" => format!("process/cargo/{}", cwd),
        _ => format!("process/{}", first_word),
    }
}

/// Execute a shell command and return stdout.
/// Used by the skill processor to resolve `!`command`` blocks in prompt.md files.
/// Timeout: 30 seconds. Working directory defaults to skill dir if provided.
#[tauri::command]
pub async fn execute_shell_command(
    command: String,
    cwd: Option<String>,
) -> Result<String, String> {
    let cwd_str = cwd.clone().unwrap_or_else(|| "unknown".to_string());
    let resource_key = derive_shell_resource_key(&command, &cwd_str);

    let pool = OPERATION_POOL
        .get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let rx = pool
        .submit(resource_key, Tier::User, move || {
            let mut cmd = no_window_command("bash");
            cmd.args(["-c", &command]);

            if let Some(dir) = &cwd {
                cmd.current_dir(dir);
            }

            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let child = cmd
                .spawn()
                .map_err(|e| format!("Failed to spawn shell: {}", e))?;

            let result = child
                .wait_with_output()
                .map_err(|e| format!("Command execution failed: {}", e))?;

            if result.status.success() {
                Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                let stdout = String::from_utf8_lossy(&result.stdout);
                if stderr.is_empty() {
                    Ok(stdout.trim().to_string())
                } else {
                    Err(format!("Command failed: {}", stderr.trim()))
                }
            }
        })
        .await;

    tokio::time::timeout(Duration::from_secs(30), rx)
        .await
        .map_err(|_| "Shell command timed out after 30 seconds".to_string())?
        .map_err(|_| "Operation pool channel closed".to_string())?
}
