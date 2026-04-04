use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<String>,
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,
    pub remote: Option<String>,
}

async fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let resource_key = format!("process/git/{}", repo_path);
    let pool = crate::operation_pool::OPERATION_POOL
        .get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;

    let repo_path = repo_path.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    let rx = pool
        .submit(
            resource_key,
            crate::operation_pool::Tier::User,
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
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    if stderr.trim().is_empty() {
                        Ok(String::new())
                    } else {
                        Err(stderr)
                    }
                }
            },
        )
        .await;

    rx.await.map_err(|_| "Operation cancelled".to_string())?
}

fn parse_status_code(code: &str) -> String {
    match code {
        "M" => "modified".to_string(),
        "A" => "added".to_string(),
        "D" => "deleted".to_string(),
        "R" => "renamed".to_string(),
        "C" => "copied".to_string(),
        "U" => "unmerged".to_string(),
        _ => "modified".to_string(),
    }
}

#[tauri::command]
pub async fn get_git_status(repo_path: String) -> Result<GitStatus, String> {
    // Get branch name
    let branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string();

    // Get ahead/behind
    let mut ahead = 0;
    let mut behind = 0;
    if let Ok(ab) = run_git(&repo_path, &["rev-list", "--left-right", "--count", &format!("HEAD...@{{u}}")]).await {
        let parts: Vec<&str> = ab.trim().split('\t').collect();
        if parts.len() == 2 {
            ahead = parts[0].parse().unwrap_or(0);
            behind = parts[1].parse().unwrap_or(0);
        }
    }

    // Get porcelain status
    let status_output = run_git(&repo_path, &["status", "--porcelain=v1", "-unormal"]).await?;

    let mut staged: Vec<FileChange> = Vec::new();
    let mut unstaged: Vec<FileChange> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();

    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }
        let index_status = &line[0..1];
        let worktree_status = &line[1..2];
        let file_path = line[3..].to_string();

        // Handle renamed files (format: "old -> new")
        let (path, old_path) = if file_path.contains(" -> ") {
            let parts: Vec<&str> = file_path.splitn(2, " -> ").collect();
            (parts[1].to_string(), Some(parts[0].to_string()))
        } else {
            (file_path.clone(), None)
        };

        // Untracked
        if index_status == "?" {
            untracked.push(path);
            continue;
        }

        // Staged changes (index status)
        if index_status != " " && index_status != "?" {
            staged.push(FileChange {
                path: path.clone(),
                status: parse_status_code(index_status),
                old_path: old_path.clone(),
            });
        }

        // Unstaged changes (worktree status)
        if worktree_status != " " && worktree_status != "?" {
            unstaged.push(FileChange {
                path: path.clone(),
                status: parse_status_code(worktree_status),
                old_path: None,
            });
        }
    }

    Ok(GitStatus {
        staged,
        unstaged,
        untracked,
        branch,
        ahead,
        behind,
    })
}

#[tauri::command]
pub async fn get_git_diff(repo_path: String, file_path: Option<String>, staged: Option<bool>) -> Result<String, String> {
    let mut args = vec!["diff"];
    if staged.unwrap_or(false) {
        args.push("--cached");
    }
    if let Some(ref fp) = file_path {
        args.push("--");
        args.push(fp);
    }
    run_git(&repo_path, &args).await
}

#[tauri::command]
pub async fn get_file_diff_content(repo_path: String, file_path: String, staged: bool) -> Result<(String, String), String> {
    // Get the "before" version
    let before = if staged {
        // For staged: compare HEAD vs index
        run_git(&repo_path, &["show", &format!("HEAD:{}", file_path)]).await
            .unwrap_or_default()
    } else {
        // For unstaged: compare index vs worktree
        run_git(&repo_path, &["show", &format!(":{}", file_path)]).await
            .unwrap_or_default()
    };

    // Get the "after" version
    let after = if staged {
        // Staged: the index version
        run_git(&repo_path, &["show", &format!(":{}", file_path)]).await
            .unwrap_or_default()
    } else {
        // Unstaged: the working tree version
        let full_path = std::path::Path::new(&repo_path).join(&file_path);
        std::fs::read_to_string(&full_path).unwrap_or_default()
    };

    Ok((before, after))
}

#[tauri::command]
pub async fn git_stage(repo_path: String, files: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["add", "--"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(file_refs);
    run_git(&repo_path, &args).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_unstage(repo_path: String, files: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["reset", "HEAD", "--"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(file_refs);
    run_git(&repo_path, &args).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "-A"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["reset", "HEAD"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    let output = run_git(&repo_path, &["commit", "-m", &message]).await?;
    // Extract commit hash from output
    let hash = run_git(&repo_path, &["rev-parse", "--short", "HEAD"]).await
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string();
    Ok(hash)
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<(), String> {
    // Check if the current branch has an upstream configured
    let has_upstream = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).await.is_ok();

    if has_upstream {
        run_git(&repo_path, &["push"]).await?;
    } else {
        // No upstream — auto-publish the branch (like VS Code does on first push)
        let branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
        let branch = branch.trim();
        run_git(&repo_path, &["push", "-u", "origin", branch]).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<(), String> {
    // If no upstream is set, there's nothing to pull from — succeed silently
    let has_upstream = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).await.is_ok();
    if has_upstream {
        run_git(&repo_path, &["pull"]).await?;
    }
    // No upstream = new branch that only exists locally, nothing to pull
    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    run_git(&repo_path, &["checkout", "-b", &branch_name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    // Check if the branch is already checked out by another worktree
    let worktree_list = run_git(&repo_path, &["worktree", "list", "--porcelain"]).await.unwrap_or_default();
    let repo_normalized = repo_path.replace('\\', "/");
    let mut current_wt_path = String::new();
    let mut current_wt_branch = String::new();

    for line in worktree_list.lines() {
        if line.starts_with("worktree ") {
            current_wt_path = line[9..].replace('\\', "/");
        } else if line.starts_with("branch refs/heads/") {
            current_wt_branch = line[18..].to_string();
        } else if line.is_empty() {
            if current_wt_branch == branch_name && current_wt_path != repo_normalized {
                return Err(format!(
                    "Branch '{}' is already checked out in another worktree at: {}",
                    branch_name, current_wt_path
                ));
            }
            current_wt_path.clear();
            current_wt_branch.clear();
        }
    }
    // Check last entry
    if current_wt_branch == branch_name && current_wt_path != repo_normalized {
        return Err(format!(
            "Branch '{}' is already checked out in another worktree at: {}",
            branch_name, current_wt_path
        ));
    }

    run_git(&repo_path, &["checkout", &branch_name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_list_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let output = run_git(&repo_path, &["branch", "-a", "--format=%(HEAD) %(refname:short) %(upstream:short)"]).await?;
    let mut branches = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let current = line.starts_with('*');
        let rest = if current { &line[2..] } else { line };
        let parts: Vec<&str> = rest.splitn(2, ' ').collect();
        let name = parts[0].to_string();
        let remote = parts.get(1).and_then(|r| {
            let r = r.trim();
            if r.is_empty() { None } else { Some(r.to_string()) }
        });

        branches.push(BranchInfo { name, current, remote });
    }

    Ok(branches)
}

#[tauri::command]
pub async fn git_discard_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_git(&repo_path, &["checkout", "--", &file_path]).await?;
    Ok(())
}

/// Delete an untracked file (git checkout doesn't work for these)
#[tauri::command]
pub async fn git_delete_untracked_file(repo_path: String, file_path: String) -> Result<(), String> {
    let full_path = std::path::Path::new(&repo_path).join(&file_path);
    if !full_path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    // Safety: only delete if the file is actually untracked
    let status = run_git(&repo_path, &["status", "--porcelain", "--", &file_path]).await?;
    if !status.starts_with("??") {
        return Err("File is tracked by git — use discard instead".to_string());
    }
    std::fs::remove_file(&full_path)
        .map_err(|e| format!("Failed to delete {}: {}", file_path, e))?;
    Ok(())
}

#[tauri::command]
pub async fn git_merge(repo_path: String, branch_name: String) -> Result<String, String> {
    run_git(&repo_path, &["merge", &branch_name]).await
}

#[tauri::command]
pub async fn git_rebase(repo_path: String, branch_name: String) -> Result<String, String> {
    run_git(&repo_path, &["rebase", &branch_name]).await
}

#[tauri::command]
pub async fn git_undo_last_commit(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["reset", "--soft", "HEAD~1"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_delete_branch(repo_path: String, branch_name: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo_path, &["branch", flag, &branch_name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_stash(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["stash", "push", "-u"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_stash_pop(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["stash", "pop"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_fetch(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["fetch", "--all"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn git_revert_last_push(repo_path: String) -> Result<(), String> {
    // Revert the last commit (creates a new revert commit)
    run_git(&repo_path, &["revert", "HEAD", "--no-edit"]).await?;
    Ok(())
}
