use crate::config::app_config::AppConfig;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::{Path, PathBuf};

/// Returns the image storage directory for a given chat session
fn images_dir(session_id: &str) -> PathBuf {
    AppConfig::config_dir().join("images").join(session_id)
}

/// Save a chat image to disk. Returns the absolute file path.
#[tauri::command]
pub async fn save_chat_image(
    session_id: String,
    name: String,
    base64_data: String,
    media_type: String,
) -> Result<String, String> {
    let dir = images_dir(&session_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create image dir: {}", e))?;

    // Determine extension from media type
    let ext = match media_type.as_str() {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    };

    // Use UUID to avoid collisions, but keep original name for reference
    let file_name = format!(
        "{}_{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(&name, ext)
    );
    let file_path = dir.join(&file_name);

    let bytes = STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Read a chat image from disk, returning it as a data URL
#[tauri::command]
pub async fn read_chat_image(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("Image file not found".to_string());
    }

    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read image: {}", e))?;
    let b64 = STANDARD.encode(&bytes);

    // Infer media type from extension
    let media_type = match path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", media_type, b64))
}

/// Delete all images for a specific chat session
#[tauri::command]
pub async fn delete_session_images(session_id: String) -> Result<(), String> {
    let dir = images_dir(&session_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to delete session images: {}", e))?;
    }
    Ok(())
}

/// Delete images for all sessions belonging to a project.
/// Requires the list of session IDs (caller queries them before DB deletion).
pub fn delete_images_for_sessions(session_ids: &[String]) {
    let base = AppConfig::config_dir().join("images");
    if !base.exists() {
        return;
    }
    for id in session_ids {
        let dir = base.join(id);
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}

fn sanitize_filename(name: &str, fallback_ext: &str) -> String {
    // Take the filename, replace unsafe chars, ensure extension
    let clean: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if clean.is_empty() {
        return format!("image.{}", fallback_ext);
    }
    // Ensure it has the right extension
    if !clean.ends_with(&format!(".{}", fallback_ext)) {
        format!("{}.{}", clean, fallback_ext)
    } else {
        clean
    }
}
