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
    /// - Windows: %APPDATA%/ProductaFlows (e.g., C:\Users\{user}\AppData\Roaming\ProductaFlows)
    /// - macOS: ~/Library/Application Support/ProductaFlows
    /// - Linux: ~/.config/ProductaFlows (via XDG_CONFIG_HOME)
    /// Falls back to ~/.productaflows if OS dirs unavailable
    pub fn config_dir() -> PathBuf {
        if let Some(config) = dirs_next::config_dir() {
            config.join("ProductaFlows")
        } else {
            let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(".productaflows")
        }
    }

    pub fn config_file_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    /// Migrate data from old ~/.productaflows/ to new OS-standard location
    pub fn migrate_if_needed() {
        let home = dirs_next::home_dir().unwrap_or_default();
        let old_dir = home.join(".productaflows");
        let new_dir = Self::config_dir();

        // Only migrate if old exists and new doesn't have a config yet
        if old_dir.exists() && old_dir != new_dir && !new_dir.join("config.json").exists() {
            if let Err(_) = fs::create_dir_all(&new_dir) {
                return;
            }
            // Copy config.json
            let old_config = old_dir.join("config.json");
            if old_config.exists() {
                let _ = fs::copy(&old_config, new_dir.join("config.json"));
            }
            // Copy logs.db
            let old_logs = old_dir.join("logs.db");
            if old_logs.exists() {
                let _ = fs::copy(&old_logs, new_dir.join("logs.db"));
            }
        }
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
