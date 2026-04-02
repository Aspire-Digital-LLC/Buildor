use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::fs;

use crate::no_window_command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub configured: bool,
    pub repo_url: Option<String>,
    pub repo_exists: bool,
    pub is_clean: bool,
    pub is_diverged: bool,
    pub last_synced: Option<String>,
    pub current_branch: Option<String>,
    pub error: Option<String>,
}

fn buildor_skills_dir() -> PathBuf {
    let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".buildor").join("skills")
}

fn config_path() -> Result<PathBuf, String> {
    let home = dirs_next::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    Ok(home.join(".productaflows").join("config.json"))
}

fn read_config() -> Result<serde_json::Value, String> {
    let path = config_path()?;
    if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        Ok(serde_json::json!({}))
    }
}

fn write_config(cfg: &serde_json::Value) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, &json)
        .map_err(|e| format!("Failed to write config: {}", e))
}

fn run_git(args: &[&str], cwd: &Path) -> Result<String, String> {
    let output = no_window_command("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("git {} failed with exit code {}", args.join(" "), output.status)
        } else {
            stderr
        })
    }
}

fn is_git_repo(dir: &Path) -> bool {
    dir.join(".git").exists()
}

#[tauri::command]
pub async fn configure_shared_repo(url: String) -> Result<(), String> {
    let mut cfg = read_config()?;
    cfg["sharedSkillsRepoUrl"] = serde_json::Value::String(url);
    write_config(&cfg)
}

#[tauri::command]
pub async fn remove_shared_repo_config() -> Result<(), String> {
    let mut cfg = read_config()?;
    if let Some(obj) = cfg.as_object_mut() {
        obj.remove("sharedSkillsRepoUrl");
        obj.remove("sharedSkillsLastSynced");
    }
    write_config(&cfg)
}

#[tauri::command]
pub async fn sync_skills_repo() -> Result<SyncStatus, String> {
    let cfg = read_config()?;
    let url = cfg.get("sharedSkillsRepoUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No shared skills repo URL configured".to_string())?
        .to_string();

    let skills_dir = buildor_skills_dir();

    if !is_git_repo(&skills_dir) {
        // First time: clone into skills dir
        // Ensure parent exists
        if let Some(parent) = skills_dir.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create .buildor dir: {}", e))?;
        }

        // If skills dir exists but isn't a git repo, we need to handle this.
        // Move existing skills to a temp dir, clone, then move them back.
        if skills_dir.exists() {
            let backup = skills_dir.with_extension("_backup");
            fs::rename(&skills_dir, &backup)
                .map_err(|e| format!("Failed to backup existing skills: {}", e))?;

            let clone_result = run_git(
                &["clone", &url, &skills_dir.to_string_lossy()],
                skills_dir.parent().unwrap(),
            );

            if let Err(e) = clone_result {
                // Restore backup on failure
                let _ = fs::remove_dir_all(&skills_dir);
                let _ = fs::rename(&backup, &skills_dir);
                return Err(format!("Clone failed: {}", e));
            }

            // Merge any backup skills that don't conflict
            if backup.exists() {
                if let Ok(entries) = fs::read_dir(&backup) {
                    for entry in entries.flatten() {
                        let dest = skills_dir.join(entry.file_name());
                        if !dest.exists() {
                            let _ = fs::rename(entry.path(), dest);
                        }
                    }
                }
                let _ = fs::remove_dir_all(&backup);
            }
        } else {
            run_git(
                &["clone", &url, &skills_dir.to_string_lossy()],
                skills_dir.parent().unwrap(),
            )?;
        }
    } else {
        // Already a git repo: pull --ff-only
        run_git(&["fetch", "origin"], &skills_dir)?;

        // Check if diverged
        let local = run_git(&["rev-parse", "HEAD"], &skills_dir).unwrap_or_default();
        let remote_branch = run_git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], &skills_dir)
            .unwrap_or_else(|_| "origin/main".to_string());
        let remote = run_git(&["rev-parse", &remote_branch], &skills_dir).unwrap_or_default();
        let merge_base = run_git(&["merge-base", "HEAD", &remote_branch], &skills_dir).unwrap_or_default();

        if local != remote {
            if merge_base == local {
                // Local is behind remote — safe to ff
                run_git(&["pull", "--ff-only"], &skills_dir)?;
            } else if merge_base == remote {
                // Local is ahead — nothing to pull
                // This is fine, just skip
            } else {
                // Diverged
                return Err("Local and remote have diverged. Resolve manually or push first.".to_string());
            }
        }
        // else: already up to date
    }

    // Update last synced timestamp
    let mut cfg = read_config()?;
    cfg["sharedSkillsLastSynced"] = serde_json::Value::String(
        chrono::Utc::now().to_rfc3339()
    );
    write_config(&cfg)?;

    get_sync_status().await
}

#[tauri::command]
pub async fn push_skill_changes(message: String) -> Result<(), String> {
    let cfg = read_config()?;
    let _url = cfg.get("sharedSkillsRepoUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No shared skills repo URL configured".to_string())?;

    let skills_dir = buildor_skills_dir();
    if !is_git_repo(&skills_dir) {
        return Err("Skills directory is not a git repository".to_string());
    }

    // Check if there are changes to commit
    let status = run_git(&["status", "--porcelain"], &skills_dir)?;
    if status.is_empty() {
        return Err("No changes to push".to_string());
    }

    run_git(&["add", "-A"], &skills_dir)?;
    run_git(&["commit", "-m", &message], &skills_dir)?;
    run_git(&["push"], &skills_dir)?;

    Ok(())
}

#[tauri::command]
pub async fn get_sync_status() -> Result<SyncStatus, String> {
    let cfg = read_config()?;
    let url = cfg.get("sharedSkillsRepoUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let last_synced = cfg.get("sharedSkillsLastSynced")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let configured = url.is_some();

    if !configured {
        return Ok(SyncStatus {
            configured: false,
            repo_url: None,
            repo_exists: false,
            is_clean: true,
            is_diverged: false,
            last_synced: None,
            current_branch: None,
            error: None,
        });
    }

    let skills_dir = buildor_skills_dir();
    let repo_exists = is_git_repo(&skills_dir);

    if !repo_exists {
        return Ok(SyncStatus {
            configured: true,
            repo_url: url,
            repo_exists: false,
            is_clean: true,
            is_diverged: false,
            last_synced,
            current_branch: None,
            error: None,
        });
    }

    let is_clean = run_git(&["status", "--porcelain"], &skills_dir)
        .map(|s| s.is_empty())
        .unwrap_or(false);

    let current_branch = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], &skills_dir).ok();

    // Check divergence (best-effort, don't fail on this)
    let is_diverged = (|| -> Result<bool, String> {
        let local = run_git(&["rev-parse", "HEAD"], &skills_dir)?;
        let upstream = run_git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], &skills_dir)?;
        let remote = run_git(&["rev-parse", &upstream], &skills_dir)?;
        if local == remote {
            return Ok(false);
        }
        let merge_base = run_git(&["merge-base", "HEAD", &upstream], &skills_dir)?;
        // Diverged if neither is ancestor of the other
        Ok(merge_base != local && merge_base != remote)
    })().unwrap_or(false);

    Ok(SyncStatus {
        configured: true,
        repo_url: url,
        repo_exists: true,
        is_clean,
        is_diverged,
        last_synced,
        current_branch,
        error: None,
    })
}
