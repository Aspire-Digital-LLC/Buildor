use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneOverride {
    pub absolute_max: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolConfig {
    pub pool_size_start: u32,
    pub pool_absolute_max: u32,
    pub lane_start_concurrency: u32,
    pub lane_absolute_max: u32,
    pub probe_threshold: u32,
    pub age_cap: u32,
    pub tick_interval_ms: u64,
    pub tick_timeout_secs: u64,
    pub op_timeout_secs: u64,
    pub max_queue_depth: usize,
    pub lane_overrides: HashMap<String, LaneOverride>,
}

impl Default for PoolConfig {
    fn default() -> Self {
        let physical = num_cpus::get_physical() as u32;
        PoolConfig {
            pool_size_start: (physical / 2).max(1),
            pool_absolute_max: physical,
            lane_start_concurrency: 1,
            lane_absolute_max: 10,
            probe_threshold: 5,
            age_cap: 20,
            tick_interval_ms: 100,
            tick_timeout_secs: 30,
            op_timeout_secs: 60,
            max_queue_depth: 100,
            lane_overrides: HashMap::new(),
        }
    }
}

impl PoolConfig {
    fn config_dir() -> PathBuf {
        if let Some(config) = dirs_next::config_dir() {
            config.join("Buildor")
        } else {
            let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(".buildor")
        }
    }

    fn config_file_path() -> PathBuf {
        Self::config_dir().join("pool_config.json")
    }

    pub fn load() -> Result<Self, String> {
        let path = Self::config_file_path();
        if !path.exists() {
            return Ok(PoolConfig::default());
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read pool config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse pool config: {}", e))
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize pool config: {}", e))?;
        fs::write(Self::config_file_path(), content)
            .map_err(|e| format!("Failed to write pool config: {}", e))
    }
}
