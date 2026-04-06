use serde::{Serialize, Deserialize};
use std::fs;
use std::path::{Path, PathBuf};
use crate::config::app_config::AppConfig;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildorSkillData {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub params: Vec<SkillParamData>,
    pub execution: Option<SkillExecutionData>,
    pub visibility: Option<SkillVisibilityData>,
    pub shell: Option<String>,

    // Resolved at load time (not from skill.json)
    #[serde(skip_deserializing)]
    pub skill_dir: String,
    #[serde(skip_deserializing)]
    pub prompt_content: String,
    #[serde(skip_deserializing)]
    pub supporting_files: Vec<String>,
    #[serde(skip_deserializing)]
    pub last_modified: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillParamData {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub required: bool,
    pub default: Option<serde_json::Value>,
    pub options: Option<Vec<String>>,
    pub description: Option<String>,
    pub placeholder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillExecutionData {
    pub allowed_tools: Option<Vec<String>>,
    pub context: Option<String>,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub return_mode: Option<String>,
    pub output_path: Option<String>,
    pub health: Option<SkillHealthData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillHealthData {
    pub idle_seconds: Option<u32>,
    pub stall_seconds: Option<u32>,
    pub loop_detection_window: Option<u32>,
    pub loop_threshold: Option<u32>,
    pub error_threshold: Option<u32>,
    pub distress_seconds: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillVisibilityData {
    pub paths: Option<Vec<String>>,
    pub auto_load: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillData {
    pub name: String,
    pub description: String,
    pub source: String,       // "project" | "personal"
    pub skill_dir: String,
    pub has_fork: bool,
}

fn buildor_skills_dir() -> PathBuf {
    // Read sharedMemoryRepo from config — skills live in {repo}/skills/
    let config_path = AppConfig::config_file_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(repo) = cfg.get("sharedMemoryRepo").and_then(|v| v.as_str()) {
                    let skills_path = PathBuf::from(repo).join("skills");
                    if skills_path.exists() {
                        return skills_path;
                    }
                }
            }
        }
    }
    // Fallback if no shared memory repo configured
    AppConfig::config_dir().join("skills")
}

/// Org-wide fallback defaults loaded from `defaults.json` at skills root.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct SkillDefaults {
    model: Option<String>,
    effort: Option<String>,
    health: Option<SkillHealthData>,
}

fn load_defaults(dir: &Path) -> SkillDefaults {
    let defaults_path = dir.join("defaults.json");
    if !defaults_path.exists() {
        return SkillDefaults::default();
    }
    let content = match fs::read_to_string(&defaults_path) {
        Ok(c) => c,
        Err(_) => return SkillDefaults::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn apply_defaults(skill: &mut BuildorSkillData, defaults: &SkillDefaults) {
    let exec = skill.execution.get_or_insert_with(|| SkillExecutionData {
        allowed_tools: None,
        context: None,
        agent: None,
        model: None,
        effort: None,
        return_mode: None,
        output_path: None,
        health: None,
    });

    if exec.model.is_none() {
        exec.model = defaults.model.clone();
    }
    if exec.effort.is_none() {
        exec.effort = defaults.effort.clone();
    }
    if exec.health.is_none() {
        exec.health = defaults.health.clone();
    }
}

fn scan_buildor_skills(dir: &Path) -> Vec<BuildorSkillData> {
    let mut skills = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };

    let defaults = load_defaults(dir);

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_json_path = path.join("skill.json");
        let prompt_md_path = path.join("prompt.md");

        if !skill_json_path.exists() {
            continue;
        }

        let json_content = match fs::read_to_string(&skill_json_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut skill: BuildorSkillData = match serde_json::from_str(&json_content) {
            Ok(s) => s,
            Err(_) => continue,
        };

        skill.skill_dir = path.to_string_lossy().to_string();

        skill.prompt_content = fs::read_to_string(&prompt_md_path).unwrap_or_default();

        // Collect supporting files (anything that isn't skill.json or prompt.md)
        if let Ok(dir_entries) = fs::read_dir(&path) {
            for f in dir_entries.flatten() {
                let fname = f.file_name().to_string_lossy().to_string();
                if fname != "skill.json" && fname != "prompt.md" {
                    skill.supporting_files.push(fname);
                }
            }
        }

        // Last modified from skill.json metadata
        if let Ok(meta) = fs::metadata(&skill_json_path) {
            if let Ok(modified) = meta.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    skill.last_modified = Some(duration.as_millis() as i64);
                }
            }
        }

        apply_defaults(&mut skill, &defaults);
        skills.push(skill);
    }

    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    skills
}

fn parse_skill_md_frontmatter(content: &str) -> (String, bool) {
    // Parse YAML frontmatter from SKILL.md for description and context: fork
    let mut description = String::new();
    let mut has_fork = false;

    if content.starts_with("---") {
        if let Some(end_idx) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end_idx];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(desc) = line.strip_prefix("description:") {
                    description = desc.trim().trim_matches('"').trim_matches('\'').to_string();
                }
                if line.contains("context:") && line.contains("fork") {
                    has_fork = true;
                }
            }
        }
    }

    (description, has_fork)
}

fn scan_project_skills(dir: &Path, source: &str) -> Vec<ProjectSkillData> {
    let mut skills = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            // Check if it's a SKILL.md file directly in the skills dir
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.ends_with(".md") && fname != "README.md" {
                let content = fs::read_to_string(&path).unwrap_or_default();
                let (description, has_fork) = parse_skill_md_frontmatter(&content);
                let name = fname.trim_end_matches(".md").to_string();
                skills.push(ProjectSkillData {
                    name,
                    description,
                    source: source.to_string(),
                    skill_dir: dir.to_string_lossy().to_string(),
                    has_fork,
                });
            }
            continue;
        }

        // Look for SKILL.md inside subdirectory
        let skill_md = path.join("SKILL.md");
        if skill_md.exists() {
            let content = fs::read_to_string(&skill_md).unwrap_or_default();
            let (description, has_fork) = parse_skill_md_frontmatter(&content);
            let name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            skills.push(ProjectSkillData {
                name,
                description,
                source: source.to_string(),
                skill_dir: path.to_string_lossy().to_string(),
                has_fork,
            });
        }
    }

    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    skills
}

#[tauri::command]
pub async fn list_buildor_skills() -> Result<Vec<BuildorSkillData>, String> {
    let dir = buildor_skills_dir();
    Ok(scan_buildor_skills(&dir))
}

#[tauri::command]
pub async fn get_buildor_skill(name: String) -> Result<BuildorSkillData, String> {
    let dir = buildor_skills_dir().join(&name);
    let skill_json_path = dir.join("skill.json");

    if !skill_json_path.exists() {
        return Err(format!("Skill '{}' not found", name));
    }

    let json_content = fs::read_to_string(&skill_json_path)
        .map_err(|e| format!("Failed to read skill.json: {}", e))?;

    let mut skill: BuildorSkillData = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse skill.json: {}", e))?;

    skill.skill_dir = dir.to_string_lossy().to_string();
    skill.prompt_content = fs::read_to_string(dir.join("prompt.md")).unwrap_or_default();

    if let Ok(dir_entries) = fs::read_dir(&dir) {
        for f in dir_entries.flatten() {
            let fname = f.file_name().to_string_lossy().to_string();
            if fname != "skill.json" && fname != "prompt.md" {
                skill.supporting_files.push(fname);
            }
        }
    }

    Ok(skill)
}

#[tauri::command]
pub async fn list_project_skills(repo_path: String) -> Result<Vec<ProjectSkillData>, String> {
    let mut all_skills = Vec::new();

    // Scan .claude/skills/ in the project repo
    let project_skills_dir = Path::new(&repo_path).join(".claude").join("skills");
    all_skills.extend(scan_project_skills(&project_skills_dir, "project"));

    // Scan ~/.claude/skills/ for personal skills
    let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let personal_skills_dir = home.join(".claude").join("skills");
    all_skills.extend(scan_project_skills(&personal_skills_dir, "personal"));

    Ok(all_skills)
}

#[tauri::command]
pub async fn save_buildor_skill(name: String, skill_json: String, prompt_md: String) -> Result<(), String> {
    let dir = buildor_skills_dir().join(&name);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    fs::write(dir.join("skill.json"), &skill_json)
        .map_err(|e| format!("Failed to write skill.json: {}", e))?;

    fs::write(dir.join("prompt.md"), &prompt_md)
        .map_err(|e| format!("Failed to write prompt.md: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_buildor_skill(name: String) -> Result<(), String> {
    let dir = buildor_skills_dir().join(&name);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to delete skill: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn index_skills() -> Result<Vec<BuildorSkillData>, String> {
    // Rebuild and return the full skills list
    // In future phases this will also update the SQLite cache
    let dir = buildor_skills_dir();
    Ok(scan_buildor_skills(&dir))
}
