use serde::{Serialize, Deserialize};
use std::collections::HashMap;
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

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStat {
    pub language: String,
    pub bytes: u64,
    pub percentage: f64,
    pub color: String,
}

#[tauri::command]
pub async fn get_language_stats(repo_path: String) -> Result<Vec<LanguageStat>, String> {
    let root = Path::new(&repo_path);
    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", repo_path));
    }

    let mut bytes_by_lang: HashMap<String, u64> = HashMap::new();

    let walker = WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(true)
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }

        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // Skip known non-code files
        if name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let lang = match ext.to_lowercase().as_str() {
            "ts" | "tsx" => "TypeScript",
            "js" | "jsx" | "mjs" | "cjs" => "JavaScript",
            "rs" => "Rust",
            "py" => "Python",
            "java" => "Java",
            "c" | "h" => "C",
            "cpp" | "cc" | "cxx" | "hpp" => "C++",
            "cs" => "C#",
            "go" => "Go",
            "rb" => "Ruby",
            "php" => "PHP",
            "swift" => "Swift",
            "kt" | "kts" => "Kotlin",
            "dart" => "Dart",
            "lua" => "Lua",
            "r" => "R",
            "html" | "htm" => "HTML",
            "css" => "CSS",
            "scss" | "sass" => "SCSS",
            "less" => "Less",
            "vue" => "Vue",
            "svelte" => "Svelte",
            "json" => "JSON",
            "yaml" | "yml" => "YAML",
            "toml" => "TOML",
            "xml" | "svg" => "XML",
            "sql" => "SQL",
            "sh" | "bash" | "zsh" => "Shell",
            "ps1" => "PowerShell",
            "md" | "mdx" => "Markdown",
            "graphql" | "gql" => "GraphQL",
            "dockerfile" => "Dockerfile",
            _ => {
                // Check filename-based languages
                match name {
                    "Dockerfile" => "Dockerfile",
                    "Makefile" | "GNUmakefile" => "Makefile",
                    "CMakeLists.txt" => "CMake",
                    _ if ext.is_empty() => continue,
                    _ => continue, // Skip unknown extensions
                }
            }
        };

        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        *bytes_by_lang.entry(lang.to_string()).or_insert(0) += size;
    }

    let total: u64 = bytes_by_lang.values().sum();
    if total == 0 {
        return Ok(vec![]);
    }

    let mut stats: Vec<LanguageStat> = bytes_by_lang
        .into_iter()
        .map(|(language, bytes)| {
            let percentage = (bytes as f64 / total as f64) * 100.0;
            let color = language_color(&language);
            LanguageStat { language, bytes, percentage, color }
        })
        .collect();

    // Sort by percentage descending
    stats.sort_by(|a, b| b.percentage.partial_cmp(&a.percentage).unwrap_or(std::cmp::Ordering::Equal));

    Ok(stats)
}

fn language_color(lang: &str) -> String {
    match lang {
        "TypeScript" => "#3178c6",
        "JavaScript" => "#f1e05a",
        "Rust" => "#dea584",
        "Python" => "#3572A5",
        "Java" => "#b07219",
        "C" => "#555555",
        "C++" => "#f34b7d",
        "C#" => "#178600",
        "Go" => "#00ADD8",
        "Ruby" => "#701516",
        "PHP" => "#4F5D95",
        "Swift" => "#F05138",
        "Kotlin" => "#A97BFF",
        "Dart" => "#00B4AB",
        "Lua" => "#000080",
        "R" => "#198CE7",
        "HTML" => "#e34c26",
        "CSS" => "#563d7c",
        "SCSS" => "#c6538c",
        "Less" => "#1d365d",
        "Vue" => "#41b883",
        "Svelte" => "#ff3e00",
        "JSON" => "#292929",
        "YAML" => "#cb171e",
        "TOML" => "#9c4221",
        "XML" => "#0060ac",
        "SQL" => "#e38c00",
        "Shell" => "#89e051",
        "PowerShell" => "#012456",
        "Markdown" => "#083fa1",
        "GraphQL" => "#e10098",
        "Dockerfile" => "#384d54",
        "Makefile" => "#427819",
        "CMake" => "#DA3434",
        _ => "#8b949e",
    }.to_string()
}
