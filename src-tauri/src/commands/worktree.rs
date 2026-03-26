#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<String>, String> {
    // TODO: Run git worktree list
    Ok(vec![])
}

#[tauri::command]
pub async fn create_worktree(repo_path: String, branch: String, path: String) -> Result<(), String> {
    // TODO: Run git worktree add
    Ok(())
}

#[tauri::command]
pub async fn remove_worktree(repo_path: String, path: String) -> Result<(), String> {
    // TODO: Run git worktree remove
    Ok(())
}

#[tauri::command]
pub async fn clean_worktrees(repo_path: String) -> Result<(), String> {
    // TODO: Remove all non-main worktrees and prune
    Ok(())
}
