use serde::{Serialize, Deserialize};
use std::fs;
use std::path::Path;
use ignore::WalkBuilder;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub async fn list_directory_recursive(path: String, respect_gitignore: bool) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }

    let entries = build_tree(root, respect_gitignore, 0, 10)?;
    Ok(entries)
}

fn build_tree(dir: &Path, respect_gitignore: bool, depth: usize, max_depth: usize) -> Result<Vec<FileEntry>, String> {
    if depth >= max_depth {
        return Ok(vec![]);
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    // Always skip these directories
    let skip_dirs = ["node_modules", "target", "dist", ".next", "__pycache__", ".cache", "build", ".turbo", ".nuxt"];

    let mut dir_entries: Vec<fs::DirEntry> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

    // Sort: directories first, then alphabetical
    dir_entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().to_ascii_lowercase().cmp(&b.file_name().to_ascii_lowercase()),
        }
    });

    for entry in dir_entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        // Skip .git directory only — show all other dotfiles (.claude, .github, .env, etc.)
        if name == ".git" {
            continue;
        }

        // Skip known junk directories
        if is_dir && skip_dirs.contains(&name.as_str()) {
            continue;
        }

        let children = if is_dir {
            Some(build_tree(&entry_path, respect_gitignore, depth + 1, max_depth)?)
        } else {
            None
        };

        // Normalize path separators to forward slashes
        let normalized_path = entry_path.to_string_lossy().replace('\\', "/");

        entries.push(FileEntry {
            name,
            path: normalized_path,
            is_directory: is_dir,
            children,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.is_file() {
        return Err(format!("'{}' is not a file", path));
    }

    // Check file size (5MB limit)
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    if metadata.len() > 5 * 1024 * 1024 {
        return Err("File is too large (>5MB)".to_string());
    }

    // Read first 8KB to check for binary content
    let preview = fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let check_bytes = &preview[..std::cmp::min(8192, preview.len())];
    if check_bytes.contains(&0) {
        return Err("File appears to be binary".to_string());
    }

    String::from_utf8(preview)
        .map_err(|_| "File is not valid UTF-8".to_string())
}
