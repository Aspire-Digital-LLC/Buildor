use serde::{Serialize, Deserialize};
use std::process::Command;
use std::path::{Path, PathBuf};
use crate::config::app_config::AppConfig;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub project_name: String,
    pub repo_path: String,
    pub worktree_path: String,
    pub branch_name: String,
    pub session_type: String,
    pub base_branch: String,
    pub issue_number: Option<String>,
    pub created_at: String,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = crate::no_window_command("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.trim().is_empty() {
            Ok(String::new())
        } else {
            Err(stderr.trim().to_string())
        }
    }
}

fn worktree_base_dir(repo_path: &str) -> PathBuf {
    let repo = Path::new(repo_path);
    let repo_name = repo.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo");
    let parent = repo.parent().unwrap_or(repo);
    parent.join(format!("{}-worktrees", repo_name))
}

/// Merge .claude/settings.local.json permission rules from a worktree back into the main repo.
/// New rules discovered in the worktree are added to the main repo's allow list (union merge).
fn merge_permission_rules(worktree_path: &str, repo_path: &str) {
    let wt_settings = Path::new(worktree_path).join(".claude").join("settings.local.json");
    let repo_settings = Path::new(repo_path).join(".claude").join("settings.local.json");

    // Nothing to merge if the worktree has no settings file
    if !wt_settings.exists() {
        return;
    }

    let wt_content = match std::fs::read_to_string(&wt_settings) {
        Ok(c) => c,
        Err(_) => return,
    };
    let wt_json: serde_json::Value = match serde_json::from_str(&wt_content) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Extract worktree rules
    let wt_rules: Vec<String> = wt_json
        .get("permissions")
        .and_then(|p| p.get("allow"))
        .and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    if wt_rules.is_empty() {
        return;
    }

    // Load or create main repo settings
    let mut repo_json: serde_json::Value = if repo_settings.exists() {
        std::fs::read_to_string(&repo_settings)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| serde_json::json!({"permissions": {"allow": []}}))
    } else {
        serde_json::json!({"permissions": {"allow": []}})
    };

    // Get mutable reference to the allow array
    let allow = repo_json
        .as_object_mut()
        .and_then(|obj| {
            obj.entry("permissions")
                .or_insert_with(|| serde_json::json!({"allow": []}))
                .as_object_mut()
        })
        .and_then(|perms| {
            perms.entry("allow")
                .or_insert_with(|| serde_json::json!([]))
                .as_array_mut()
        });

    if let Some(allow) = allow {
        let existing: std::collections::HashSet<String> = allow
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();

        for rule in &wt_rules {
            if !existing.contains(rule) {
                allow.push(serde_json::Value::String(rule.clone()));
            }
        }

        // Write back
        let claude_dir = Path::new(repo_path).join(".claude");
        let _ = std::fs::create_dir_all(&claude_dir);
        let _ = std::fs::write(
            &repo_settings,
            serde_json::to_string_pretty(&repo_json).unwrap_or_default(),
        );
    }
}

fn sessions_dir(project_name: &str) -> PathBuf {
    AppConfig::config_dir().join("projects").join(project_name).join("sessions")
}

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = run_git(&repo_path, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();

    for line in output.lines() {
        if line.starts_with("worktree ") {
            current_path = line[9..].to_string();
        } else if line.starts_with("branch ") {
            current_branch = line[7..].to_string();
            // Strip refs/heads/ prefix
            if current_branch.starts_with("refs/heads/") {
                current_branch = current_branch[11..].to_string();
            }
        } else if line.is_empty() && !current_path.is_empty() {
            let normalized = current_path.replace('\\', "/");
            let repo_normalized = repo_path.replace('\\', "/");
            let is_main = normalized == repo_normalized;
            worktrees.push(WorktreeInfo {
                path: current_path.clone(),
                branch: current_branch.clone(),
                is_main,
            });
            current_path.clear();
            current_branch.clear();
        }
    }
    // Handle last entry if no trailing newline
    if !current_path.is_empty() {
        let normalized = current_path.replace('\\', "/");
        let repo_normalized = repo_path.replace('\\', "/");
        let is_main = normalized == repo_normalized;
        worktrees.push(WorktreeInfo {
            path: current_path,
            branch: current_branch,
            is_main,
        });
    }

    Ok(worktrees)
}

#[tauri::command]
pub async fn create_session(
    project_name: String,
    repo_path: String,
    base_branch: String,
    session_type: String,
    slug: String,
    issue_number: Option<String>,
) -> Result<SessionInfo, String> {
    let session_id = uuid_v4();

    // Build branch name: {type}/{base}/{issue#}/{slug} or {type}/{base}/{slug}
    let branch_name = if let Some(ref issue) = issue_number {
        format!("{}/{}/{}/{}", session_type, base_branch, issue, slug)
    } else {
        format!("{}/{}/{}", session_type, base_branch, slug)
    };

    // Worktree path
    let wt_base = worktree_base_dir(&repo_path);
    let safe_branch = branch_name.replace('/', "-");
    let wt_path = wt_base.join(&safe_branch);
    let wt_path_str = wt_path.to_string_lossy().to_string();

    // Ensure base dir exists
    std::fs::create_dir_all(&wt_base)
        .map_err(|e| format!("Failed to create worktree directory: {}", e))?;

    // Fetch latest
    let _ = run_git(&repo_path, &["fetch", "--all"]);

    // Create branch and worktree
    run_git(&repo_path, &["branch", "--no-track", &branch_name, &format!("origin/{}", base_branch)])
        .or_else(|_| run_git(&repo_path, &["branch", "--no-track", &branch_name, &base_branch]))?;

    // Add worktree
    run_git(&repo_path, &["worktree", "add", &wt_path_str, &branch_name])?;

    // Push branch to remote and set upstream tracking
    let _ = run_git(&wt_path_str, &["push", "-u", "origin", &branch_name]);

    // Copy .claude/settings.local.json from main repo to worktree (inherit permission rules)
    let source_settings = Path::new(&repo_path).join(".claude").join("settings.local.json");
    if source_settings.exists() {
        let wt_claude_dir = wt_path.join(".claude");
        let _ = std::fs::create_dir_all(&wt_claude_dir);
        let _ = std::fs::copy(&source_settings, wt_claude_dir.join("settings.local.json"));
    }

    let created_at = chrono::Utc::now().to_rfc3339();

    let session = SessionInfo {
        session_id: session_id.clone(),
        project_name: project_name.clone(),
        repo_path: repo_path.clone(),
        worktree_path: wt_path_str.clone(),
        branch_name: branch_name.clone(),
        session_type: session_type.clone(),
        base_branch: base_branch.clone(),
        issue_number: issue_number.clone(),
        created_at: created_at.clone(),
    };

    // Save session info to disk
    let session_dir = sessions_dir(&project_name);
    std::fs::create_dir_all(&session_dir)
        .map_err(|e| format!("Failed to create session dir: {}", e))?;
    let session_file = session_dir.join(format!("{}.json", session_id));
    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    std::fs::write(&session_file, json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    Ok(session)
}

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    let config = AppConfig::load()?;
    let mut all_sessions = Vec::new();

    for project in &config.projects {
        let dir = sessions_dir(&project.name);
        if !dir.exists() {
            continue;
        }
        let entries = std::fs::read_dir(&dir)
            .map_err(|e| format!("Failed to read sessions dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(session) = serde_json::from_str::<SessionInfo>(&content) {
                        all_sessions.push(session);
                    }
                }
            }
        }
    }

    // Sort by created_at descending
    all_sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(all_sessions)
}

#[tauri::command]
pub async fn close_session(session_id: String, project_name: String, repo_path: String, worktree_path: String, force: Option<bool>) -> Result<(), String> {
    let force = force.unwrap_or(false);

    // If the worktree directory no longer exists, just clean up the session file and prune
    let wt_path = Path::new(&worktree_path);
    if !wt_path.exists() {
        let _ = run_git(&repo_path, &["worktree", "prune"]);
        let session_file = sessions_dir(&project_name).join(format!("{}.json", session_id));
        if session_file.exists() {
            let _ = std::fs::remove_file(&session_file);
        }
        let session_data = sessions_dir(&project_name).join(&session_id);
        if session_data.exists() {
            let _ = std::fs::remove_dir_all(&session_data);
        }
        return Ok(());
    }

    // Safety check: warn if there are uncommitted changes or unpushed commits
    if !force {
        // Check for uncommitted changes
        let status = run_git(&worktree_path, &["status", "--porcelain"]).unwrap_or_default();
        if !status.trim().is_empty() {
            return Err("Session has uncommitted changes. Commit or discard them first, or force-close.".to_string());
        }

        // Read the session file to get the base branch for accurate comparison
        let session_file = sessions_dir(&project_name).join(format!("{}.json", session_id));
        let base_branch = if let Ok(content) = std::fs::read_to_string(&session_file) {
            serde_json::from_str::<SessionInfo>(&content)
                .ok()
                .map(|s| s.base_branch)
        } else {
            None
        };

        // Check for unpushed work: compare HEAD against the base branch (origin/{base})
        // rather than @{u}, since worktree branches are created with --no-track
        // and may not have an upstream, or may track the wrong one.
        if let Some(ref base) = base_branch {
            let base_ref = format!("origin/{}", base);
            // Check if branch has commits beyond the base
            let ahead = run_git(&worktree_path, &["rev-list", "--count", &format!("{}..HEAD", base_ref)]).unwrap_or_default();
            if ahead.trim().parse::<i32>().unwrap_or(0) > 0 {
                // Has local commits — check if they've been pushed to a remote branch
                let branch_name = run_git(&worktree_path, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
                let remote_ref = format!("origin/{}", branch_name.trim());
                let remote_exists = run_git(&worktree_path, &["rev-parse", "--verify", &remote_ref]).is_ok();
                if !remote_exists {
                    return Err("Session branch was never pushed to remote. Push first, or force-close.".to_string());
                }
                // Remote exists — check if local is ahead of it
                let ahead_of_remote = run_git(&worktree_path, &["rev-list", "--count", &format!("{}..HEAD", remote_ref)]).unwrap_or_default();
                if ahead_of_remote.trim().parse::<i32>().unwrap_or(0) > 0 {
                    return Err("Session has unpushed commits. Push first, or force-close.".to_string());
                }
            }
        }
    }

    // Stop any Claude sessions running in this worktree (releases file locks)
    super::claude::stop_sessions_in_dir(&worktree_path);

    // Merge permission rules from worktree back to main repo before removal
    merge_permission_rules(&worktree_path, &repo_path);

    // Brief pause to let processes fully exit and release file handles
    std::thread::sleep(std::time::Duration::from_millis(300));

    // Remove worktree — try git first, fall back to manual deletion on Windows lock errors
    let remove_result = run_git(&repo_path, &["worktree", "remove", &worktree_path, "--force"]);
    if let Err(ref e) = remove_result {
        if e.contains("Permission denied") || e.contains("being used by another process") {
            // Windows file lock — try to remove the directory manually after a short delay
            // This handles cases where a Claude process or editor just released the lock
            std::thread::sleep(std::time::Duration::from_millis(500));
            let wt = Path::new(&worktree_path);
            if wt.exists() {
                let _ = std::fs::remove_dir_all(wt);
            }
            // Force git to forget about the worktree even if dir removal partially failed
            let _ = run_git(&repo_path, &["worktree", "prune"]);
        } else {
            // Non-lock error — still clean up the session file so it doesn't become a zombie
            let session_file = sessions_dir(&project_name).join(format!("{}.json", session_id));
            if session_file.exists() {
                let _ = std::fs::remove_file(&session_file);
            }
            return Err(e.clone());
        }
    }

    // Prune
    let _ = run_git(&repo_path, &["worktree", "prune"]);

    // Delete session file
    let session_file = sessions_dir(&project_name).join(format!("{}.json", session_id));
    if session_file.exists() {
        let _ = std::fs::remove_file(&session_file);
    }

    // Clean up session data directory if it exists
    let session_data = sessions_dir(&project_name).join(&session_id);
    if session_data.exists() {
        let _ = std::fs::remove_dir_all(&session_data);
    }

    Ok(())
}

#[tauri::command]
pub async fn close_all_sessions(project_name: Option<String>, force: Option<bool>) -> Result<(), String> {
    let sessions = list_sessions().await?;
    let mut errors = Vec::new();

    for session in sessions {
        if let Some(ref pn) = project_name {
            if &session.project_name != pn {
                continue;
            }
        }
        if let Err(e) = close_session(
            session.session_id.clone(),
            session.project_name,
            session.repo_path,
            session.worktree_path,
            force,
        ).await {
            errors.push(format!("{}: {}", session.session_id, e));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

#[tauri::command]
pub async fn create_worktree(repo_path: String, branch: String, path: String) -> Result<(), String> {
    run_git(&repo_path, &["worktree", "add", &path, &branch])?;
    Ok(())
}

#[tauri::command]
pub async fn remove_worktree(repo_path: String, path: String) -> Result<(), String> {
    run_git(&repo_path, &["worktree", "remove", &path, "--force"])?;
    let _ = run_git(&repo_path, &["worktree", "prune"]);
    Ok(())
}

#[tauri::command]
pub async fn clean_worktrees(repo_path: String) -> Result<(), String> {
    let worktrees = list_worktrees(repo_path.clone()).await?;
    for wt in worktrees {
        if !wt.is_main {
            let _ = run_git(&repo_path, &["worktree", "remove", &wt.path, "--force"]);
        }
    }
    let _ = run_git(&repo_path, &["worktree", "prune"]);
    Ok(())
}

#[tauri::command]
pub async fn get_branches_for_repo(repo_path: String) -> Result<Vec<String>, String> {
    // Get remote branches for base branch selection
    let _ = run_git(&repo_path, &["fetch", "--all"]);
    let output = run_git(&repo_path, &["branch", "-r", "--format=%(refname:short)"])?;
    let mut branches: Vec<String> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.contains("HEAD"))
        .map(|l| l.strip_prefix("origin/").unwrap_or(&l).to_string())
        .collect();
    branches.sort();
    branches.dedup();
    Ok(branches)
}

#[tauri::command]
pub async fn setup_worktree_deps(
    worktree_path: String,
    repo_path: String,
    strategy: String,
) -> Result<String, String> {
    let wt = Path::new(&worktree_path);

    // Detect: does this worktree have a package.json?
    if !wt.join("package.json").exists() {
        return Ok("skipped:no-package-json".to_string());
    }

    match strategy.as_str() {
        "none" => Ok("skipped:strategy-none".to_string()),

        "symlink" => {
            let source = Path::new(&repo_path).join("node_modules");
            let target = wt.join("node_modules");

            if !source.exists() {
                return Err("Main repo has no node_modules — run npm/pnpm install there first.".to_string());
            }
            if target.exists() {
                return Ok("skipped:node-modules-exists".to_string());
            }

            // Platform-specific symlink/junction
            #[cfg(windows)]
            {
                // Use directory junction on Windows (no admin required)
                let output = crate::no_window_command("cmd")
                    .args(["/C", "mklink", "/J",
                        &target.to_string_lossy(),
                        &source.to_string_lossy()])
                    .output()
                    .map_err(|e| format!("Failed to create junction: {}", e))?;
                if !output.status.success() {
                    return Err(format!("mklink /J failed: {}", String::from_utf8_lossy(&output.stderr)));
                }
            }
            #[cfg(not(windows))]
            {
                std::os::unix::fs::symlink(&source, &target)
                    .map_err(|e| format!("Failed to create symlink: {}", e))?;
            }

            Ok("ok:symlink".to_string())
        }

        "pnpm" => {
            let output = crate::no_window_command("pnpm")
                .arg("install")
                .arg("--frozen-lockfile")
                .current_dir(&worktree_path)
                .output()
                .map_err(|e| format!("Failed to run pnpm install: {}", e))?;
            if !output.status.success() {
                // Retry without --frozen-lockfile (lockfile may differ on branch)
                let retry = crate::no_window_command("pnpm")
                    .arg("install")
                    .current_dir(&worktree_path)
                    .output()
                    .map_err(|e| format!("Failed to run pnpm install: {}", e))?;
                if !retry.status.success() {
                    return Err(format!("pnpm install failed: {}", String::from_utf8_lossy(&retry.stderr)));
                }
            }
            Ok("ok:pnpm".to_string())
        }

        "npm" => {
            let output = crate::no_window_command("npm")
                .arg("install")
                .current_dir(&worktree_path)
                .output()
                .map_err(|e| format!("Failed to run npm install: {}", e))?;
            if !output.status.success() {
                return Err(format!("npm install failed: {}", String::from_utf8_lossy(&output.stderr)));
            }
            Ok("ok:npm".to_string())
        }

        _ => Err(format!("Unknown strategy: {}", strategy)),
    }
}

/// Simple UUID v4 generator (no external crate needed)
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let seed = now.as_nanos();
    // Not cryptographically secure but fine for session IDs
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (seed & 0xFFFFFFFF) as u32,
        ((seed >> 32) & 0xFFFF) as u16,
        ((seed >> 48) & 0x0FFF) as u16,
        (((seed >> 60) & 0x3F) | 0x80) as u16 | (((seed >> 66) & 0xFF) << 8) as u16,
        ((seed >> 74) & 0xFFFFFFFFFFFF) as u64,
    )
}
