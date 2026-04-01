use std::process::Command;
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
    let shell = if cfg!(target_os = "windows") {
        "bash"
    } else {
        "bash"
    };

    let mut cmd = no_window_command(shell);
    cmd.args(["-c", &command]);

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    // Capture stdout and stderr
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Wait with timeout using a blocking thread
    let output = tokio::task::spawn_blocking(move || {
        // We can't use wait_with_output with a timeout directly,
        // so we use wait_with_output and rely on the task timeout
        child.wait_with_output()
    });

    let result = tokio::time::timeout(Duration::from_secs(30), output)
        .await
        .map_err(|_| "Shell command timed out after 30 seconds".to_string())?
        .map_err(|e| format!("Task join error: {}", e))?
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
}
