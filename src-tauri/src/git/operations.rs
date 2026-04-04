pub async fn run_git_command(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let resource_key = format!("process/git/{}", repo_path);
    let pool = crate::operation_pool::OPERATION_POOL
        .get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let repo_path = repo_path.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    let rx = pool
        .submit(
            resource_key,
            crate::operation_pool::Tier::Subagent,
            move || {
                let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                let output = crate::no_window_command("git")
                    .args(&arg_refs)
                    .current_dir(&repo_path)
                    .output()
                    .map_err(|e| format!("Failed to run git: {}", e))?;

                if output.status.success() {
                    Ok(String::from_utf8_lossy(&output.stdout).to_string())
                } else {
                    Err(String::from_utf8_lossy(&output.stderr).to_string())
                }
            },
        )
        .await;

    rx.await.map_err(|_| "Operation cancelled".to_string())?
}
