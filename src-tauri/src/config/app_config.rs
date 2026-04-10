use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub projects: Vec<ProjectConfig>,
    pub workflows_repo: Option<String>,
    pub active_project_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub name: String,
    pub repo_path: String,
    pub scoped_skills: Vec<String>,
    pub scoped_flows: Vec<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            projects: vec![],
            workflows_repo: None,
            active_project_name: None,
        }
    }
}

impl AppConfig {
    /// Returns the OS-standard app data directory:
    /// - Windows: %APPDATA%/Buildor (e.g., C:\Users\{user}\AppData\Roaming\Buildor)
    /// - macOS: ~/Library/Application Support/Buildor
    /// - Linux: ~/.config/Buildor (via XDG_CONFIG_HOME)
    /// Falls back to ~/.buildor if OS dirs unavailable
    pub fn config_dir() -> PathBuf {
        let dir_name = if cfg!(debug_assertions) { "Buildor-dev" } else { "Buildor" };
        if let Some(config) = dirs_next::config_dir() {
            config.join(dir_name)
        } else {
            let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(if cfg!(debug_assertions) { ".buildor-dev" } else { ".buildor" })
        }
    }

    /// Returns the OS-standard data directory (dev-aware):
    /// - Windows: %LOCALAPPDATA%/Buildor (or Buildor-dev)
    /// - macOS: ~/Library/Application Support/Buildor
    /// - Linux: ~/.local/share/Buildor (via XDG_DATA_HOME)
    /// Falls back to config_dir if data_dir unavailable.
    pub fn data_dir() -> PathBuf {
        let dir_name = if cfg!(debug_assertions) { "Buildor-dev" } else { "Buildor" };
        if let Some(data) = dirs_next::data_dir() {
            data.join(dir_name)
        } else {
            // Fall back to config_dir — still dev-aware
            Self::config_dir()
        }
    }

    pub fn config_file_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    /// Migrate data from old locations to the current OS-standard location
    pub fn migrate_if_needed() {
        let new_dir = Self::config_dir();
        if new_dir.join("config.json").exists() {
            return; // Already have config, no migration needed
        }

        // Check old locations in order of preference
        let home = dirs_next::home_dir().unwrap_or_default();
        let old_locations = vec![
            // Previous app name in AppData
            dirs_next::config_dir().map(|d| d.join("ProductaFlows")),
            // Home dir dotfile variants
            Some(home.join(".productaflows")),
            Some(home.join(".buildor")),
        ];

        for old_dir_opt in old_locations {
            if let Some(old_dir) = old_dir_opt {
                if old_dir.exists() && old_dir != new_dir {
                    if let Err(_) = fs::create_dir_all(&new_dir) {
                        return;
                    }
                    let old_config = old_dir.join("config.json");
                    if old_config.exists() {
                        let _ = fs::copy(&old_config, new_dir.join("config.json"));
                    }
                    let old_logs = old_dir.join("logs.db");
                    if old_logs.exists() {
                        let _ = fs::copy(&old_logs, new_dir.join("logs.db"));
                    }
                    // Copy projects directory if it exists
                    let old_projects = old_dir.join("projects");
                    if old_projects.exists() {
                        let _ = Self::copy_dir_recursive(&old_projects, &new_dir.join("projects"));
                    }
                    return; // Migrated from first found location
                }
            }
        }
    }

    fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            if src_path.is_dir() {
                Self::copy_dir_recursive(&src_path, &dst_path)?;
            } else {
                let _ = fs::copy(&src_path, &dst_path);
            }
        }
        Ok(())
    }

    pub fn load() -> Result<Self, String> {
        Self::migrate_if_needed();
        let path = Self::config_file_path();
        if !path.exists() {
            return Ok(AppConfig::default());
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(Self::config_file_path(), content)
            .map_err(|e| format!("Failed to write config: {}", e))
    }
}
