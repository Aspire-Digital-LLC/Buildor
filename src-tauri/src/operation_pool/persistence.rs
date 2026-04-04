use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLaneLimit {
    pub max_seen_healthy: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLimits {
    pub pool_max_threads: Option<u32>,
    pub lanes: HashMap<String, PersistedLaneLimit>,
}

impl PersistedLimits {
    fn config_dir() -> PathBuf {
        if let Some(config) = dirs_next::config_dir() {
            config.join("Buildor")
        } else {
            let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(".buildor")
        }
    }

    fn config_file_path() -> PathBuf {
        Self::config_dir().join("pool_limits.json")
    }

    pub fn load() -> Result<Self, String> {
        let path = Self::config_file_path();
        if !path.exists() {
            return Ok(PersistedLimits::default());
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read persisted limits: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse persisted limits: {}", e))
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize persisted limits: {}", e))?;
        fs::write(Self::config_file_path(), content)
            .map_err(|e| format!("Failed to write persisted limits: {}", e))
    }
}
