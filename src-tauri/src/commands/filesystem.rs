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

        // Skip temp/lock files (Office ~$, editor ~, .swp, etc.)
        if !is_dir && (name.starts_with("~$") || name.starts_with("~") || name.ends_with(".swp") || name.ends_with(".swo")) {
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCommand {
    pub name: String,
    pub description: String,
    pub source: String, // "skill" or "command"
}

#[tauri::command]
pub async fn list_claude_commands(repo_path: String) -> Result<Vec<ClaudeCommand>, String> {
    let root = Path::new(&repo_path);
    let claude_dir = root.join(".claude");
    if !claude_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut commands = Vec::new();

    // Scan .claude/skills/**/SKILL.md
    let skills_dir = claude_dir.join("skills");
    if skills_dir.is_dir() {
        scan_skills(&skills_dir, &skills_dir, &mut commands)?;
    }

    // Scan .claude/commands/*.md
    let commands_dir = claude_dir.join("commands");
    if commands_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&commands_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    if stem.is_empty() { continue; }
                    let description = parse_frontmatter_description(&path).unwrap_or_default();
                    commands.push(ClaudeCommand {
                        name: format!("/{}", stem),
                        description,
                        source: "command".to_string(),
                    });
                }
            }
        }
    }

    // Sort by name
    commands.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(commands)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCommand {
    pub name: String,
    pub source: String,
    pub description: String,
    pub content: String,
    pub file_path: String,
}

/// Look up a slash command by name in the project's .claude/ directory.
/// Returns the file content if found, or an error if not.
#[tauri::command]
pub async fn resolve_claude_command(repo_path: String, command_name: String) -> Result<ResolvedCommand, String> {
    let name = command_name.strip_prefix('/').unwrap_or(&command_name);
    let root = Path::new(&repo_path);
    let claude_dir = root.join(".claude");

    // Check .claude/commands/<name>.md
    let cmd_file = claude_dir.join("commands").join(format!("{}.md", name));
    if cmd_file.is_file() {
        let content = fs::read_to_string(&cmd_file)
            .map_err(|e| format!("Failed to read command file: {}", e))?;
        let description = parse_frontmatter_description(&cmd_file).unwrap_or_default();
        return Ok(ResolvedCommand {
            name: format!("/{}", name),
            source: "command".to_string(),
            description,
            content,
            file_path: cmd_file.to_string_lossy().replace('\\', "/"),
        });
    }

    // Check .claude/skills/<name>/SKILL.md (and nested)
    let skills_dir = claude_dir.join("skills");
    if skills_dir.is_dir() {
        if let Some(resolved) = find_skill_by_name(&skills_dir, name) {
            return Ok(resolved);
        }
    }

    Err(format!("Unknown command: /{}", name))
}

fn find_skill_by_name(dir: &Path, name: &str) -> Option<ResolvedCommand> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = path.file_name()?.to_str()?;
            let skill_file = path.join("SKILL.md");
            if dir_name == name && skill_file.is_file() {
                let content = fs::read_to_string(&skill_file).ok()?;
                let description = parse_frontmatter_description(&skill_file).unwrap_or_default();
                return Some(ResolvedCommand {
                    name: format!("/{}", name),
                    source: "skill".to_string(),
                    description,
                    content,
                    file_path: skill_file.to_string_lossy().replace('\\', "/"),
                });
            }
            // Recurse
            if let Some(found) = find_skill_by_name(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

fn scan_skills(base: &Path, dir: &Path, commands: &mut Vec<ClaudeCommand>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read skills dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let skill_file = path.join("SKILL.md");
            if skill_file.is_file() {
                let skill_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                if skill_name.is_empty() { continue; }
                let description = parse_frontmatter_description(&skill_file).unwrap_or_default();
                commands.push(ClaudeCommand {
                    name: format!("/{}", skill_name),
                    description,
                    source: "skill".to_string(),
                });
            }
            // Recurse into subdirectories
            scan_skills(base, &path, commands)?;
        }
    }
    Ok(())
}

fn parse_frontmatter_description(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    // Parse YAML frontmatter between --- delimiters
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let frontmatter = &rest[..end];
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(desc) = trimmed.strip_prefix("description:") {
            let desc = desc.trim().trim_matches('"').trim_matches('\'');
            if !desc.is_empty() {
                return Some(desc.to_string());
            }
        }
    }
    None
}

/// Dark-mode-optimized language colors — all visible on #161b22 backgrounds
fn language_color(lang: &str) -> String {
    match lang {
        "TypeScript" => "#519aba",
        "JavaScript" => "#f0db4f",
        "Rust" => "#dea584",
        "Python" => "#6b9fd4",
        "Java" => "#e76f00",
        "C" => "#9b9b9b",
        "C++" => "#f34b7d",
        "C#" => "#68b723",
        "Go" => "#00ADD8",
        "Ruby" => "#cc342d",
        "PHP" => "#8892bf",
        "Swift" => "#F05138",
        "Kotlin" => "#c77dff",
        "Dart" => "#00d2b8",
        "Lua" => "#6666cc",
        "R" => "#45a3e6",
        "HTML" => "#e96228",
        "CSS" => "#8b6bbf",
        "SCSS" => "#d672a8",
        "Less" => "#5a8fbf",
        "Vue" => "#41b883",
        "Svelte" => "#ff5722",
        "JSON" => "#cbcb41",
        "YAML" => "#e74c3c",
        "TOML" => "#c97042",
        "XML" => "#4aa3df",
        "SQL" => "#f0a83a",
        "Shell" => "#89e051",
        "PowerShell" => "#5391c5",
        "Markdown" => "#519aba",
        "GraphQL" => "#e535ab",
        "Dockerfile" => "#5ba4cf",
        "Makefile" => "#6abf4b",
        "CMake" => "#e44d4d",
        _ => "#8b949e",
    }.to_string()
}
