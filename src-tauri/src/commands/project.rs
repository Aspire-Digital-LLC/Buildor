use crate::config::app_config::{AppConfig, ProjectConfig};
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub async fn list_projects() -> Result<Vec<ProjectConfig>, String> {
    let config = AppConfig::load()?;
    Ok(config.projects)
}

#[tauri::command]
pub async fn add_project(name: String, path: String) -> Result<(), String> {
    // Validate it's a git repo
    let git_dir = Path::new(&path).join(".git");
    if !git_dir.exists() {
        return Err(format!("'{}' is not a git repository (no .git directory found)", path));
    }

    let mut config = AppConfig::load()?;

    // Check for duplicate name
    if config.projects.iter().any(|p| p.name == name) {
        return Err(format!("A project named '{}' already exists", name));
    }

    config.projects.push(ProjectConfig {
        name,
        repo_path: path,
        scoped_skills: vec![],
        scoped_flows: vec![],
    });

    config.save()
}

#[tauri::command]
pub async fn remove_project(name: String) -> Result<(), String> {
    let mut config = AppConfig::load()?;
    let before = config.projects.len();
    config.projects.retain(|p| p.name != name);

    if config.projects.len() == before {
        return Err(format!("No project named '{}' found", name));
    }

    // Clear active project if it was the one removed
    if config.active_project_name.as_deref() == Some(&name) {
        config.active_project_name = None;
    }

    config.save()
}

#[tauri::command]
pub async fn get_current_branch(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub async fn set_active_project(name: String) -> Result<(), String> {
    let mut config = AppConfig::load()?;

    // Validate project exists
    if !config.projects.iter().any(|p| p.name == name) {
        return Err(format!("No project named '{}' found", name));
    }

    config.active_project_name = Some(name);
    config.save()
}

#[tauri::command]
pub async fn get_active_project() -> Result<Option<ProjectConfig>, String> {
    let config = AppConfig::load()?;
    match &config.active_project_name {
        Some(name) => Ok(config.projects.into_iter().find(|p| p.name == *name)),
        None => Ok(None),
    }
}
