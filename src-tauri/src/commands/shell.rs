use std::time::Duration;

use crate::no_window_command;

/// Execute a shell command and return stdout.
/// Used by the skill processor to resolve `!`command`` blocks in prompt.md files.
/// Timeout: 30 seconds. Working directory defaults to skill dir if provided.
#[tauri::command]
pub async fn execute_shell_command(
    command: String,
    cwd: Option<String>,
) -> Result<String, String> {
    let task = tokio::task::spawn_blocking(move || {
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
    });

    tokio::time::timeout(Duration::from_secs(30), task)
        .await
        .map_err(|_| "Shell command timed out after 30 seconds".to_string())?
        .map_err(|e| format!("Task join error: {}", e))?
}
