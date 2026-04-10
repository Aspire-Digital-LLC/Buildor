fn config_path() -> Result<std::path::PathBuf, String> {
    Ok(crate::config::app_config::AppConfig::config_file_path())
}

#[tauri::command]
pub async fn get_config() -> Result<String, String> {
    let path = config_path()?;
    if path.exists() {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read config: {}", e))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
pub async fn set_config(config: String) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    std::fs::write(&path, &config)
        .map_err(|e| format!("Failed to write config: {}", e))
}

/// Scaffold the expected shared memory repo structure, creating missing dirs/files.
/// Uses .gitkeep for empty directories so they're tracked by git.
#[tauri::command]
pub async fn scaffold_shared_repo(repo_path: String) -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;

    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", repo_path));
    }

    let mut created: Vec<String> = Vec::new();

    // .buildor.json
    let buildor_json = root.join(".buildor.json");
    if !buildor_json.exists() {
        fs::write(&buildor_json, "{\n  \"name\": \"shared-repo\",\n  \"version\": \"1.0.0\"\n}\n")
            .map_err(|e| format!("Failed to create .buildor.json: {}", e))?;
        created.push(".buildor.json".to_string());
    }

    // flows/
    let flows_dir = root.join("flows");
    if !flows_dir.exists() {
        fs::create_dir_all(&flows_dir)
            .map_err(|e| format!("Failed to create flows/: {}", e))?;
        fs::write(flows_dir.join(".gitkeep"), "")
            .map_err(|e| format!("Failed to create flows/.gitkeep: {}", e))?;
        created.push("flows/".to_string());
    }

    // skills/
    let skills_dir = root.join("skills");
    if !skills_dir.exists() {
        fs::create_dir_all(&skills_dir)
            .map_err(|e| format!("Failed to create skills/: {}", e))?;
        fs::write(skills_dir.join(".gitkeep"), "")
            .map_err(|e| format!("Failed to create skills/.gitkeep: {}", e))?;
        created.push("skills/".to_string());
    }

    Ok(created)
}

#[tauri::command]
pub async fn get_app_info() -> Result<serde_json::Value, String> {
    let version = std::env!("CARGO_PKG_VERSION").to_string();
    let is_dev = cfg!(debug_assertions);
    let sdk_port = crate::sdk_client::default_sdk_port().to_string();
    Ok(serde_json::json!({
        "version": version,
        "isDev": is_dev,
        "sdkPort": sdk_port,
    }))
}

#[tauri::command]
pub async fn check_for_update() -> Result<(String, String, bool), String> {
    // Read local version
    let local_ver = std::env!("CARGO_PKG_VERSION").to_string();

    // Fetch remote VERSION from GitHub
    let curl_output = crate::no_window_command("curl")
        .args(["-sSfkL", "https://raw.githubusercontent.com/Aspire-Digital-LLC/Buildor/main/VERSION"])
        .output()
        .map_err(|e| format!("Failed to fetch VERSION: {}", e))?;

    if !curl_output.status.success() {
        return Err("Could not fetch remote version".to_string());
    }

    let remote_ver = String::from_utf8_lossy(&curl_output.stdout).trim().to_string();
    let needs_update = remote_ver != local_ver && remote_ver > local_ver;

    Ok((local_ver, remote_ver, needs_update))
}
