use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Flow {
    pub name: String,
    pub description: String,
    pub stages: Vec<Stage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Stage {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub model: String,
    pub description: String,
    pub requirements: Vec<String>,
    pub restrictions: Vec<String>,
    pub skills: Vec<String>,
    pub read_context: Vec<String>,
    pub autonomous: bool,
    pub skippable: bool,
    pub plan_mode: bool,
    pub dependencies: Vec<String>,
    pub parallel_optional: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub params: Vec<SkillParam>,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillParam {
    pub name: String,
    pub param_type: String,
    pub required: bool,
    pub flag: Option<String>,
    pub default: Option<String>,
}
