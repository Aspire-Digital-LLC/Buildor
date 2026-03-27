#[tauri::command]
pub async fn get_config() -> Result<String, String> {
    // TODO: Read ~/.productaflows/config.json
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn set_config(config: String) -> Result<(), String> {
    // TODO: Write to ~/.productaflows/config.json
    Ok(())
}

#[tauri::command]
pub async fn check_for_update() -> Result<(String, String, bool), String> {
    // Read local version
    let local_ver = std::env!("CARGO_PKG_VERSION").to_string();

    // Fetch remote VERSION from GitHub
    let curl_output = std::process::Command::new("curl")
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
