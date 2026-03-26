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
    pub fn config_dir() -> PathBuf {
        let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
        home.join(".productaflows")
    }

    pub fn config_file_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    pub fn load() -> Result<Self, String> {
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
