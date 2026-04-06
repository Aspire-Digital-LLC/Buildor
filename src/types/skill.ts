// --- Skill Parameter (shared between Buildor and translated native skills) ---

export interface SkillParam {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  required: boolean;
  default?: string | number | boolean;
  options?: string[];       // for select type
  description?: string;
  placeholder?: string;     // hint text in modal input
}

// --- Skill Execution Config ---

export interface SkillExecution {
  allowedTools?: string[];
  context?: 'fork';
  agent?: string;           // subagent type: 'Explore' | 'Plan' | 'general-purpose'
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  returnMode?: 'summary' | 'file' | 'both';
  outputPath?: string;      // supports {{name}} and {{timestamp}}
  health?: SkillHealthConfig;
}

export interface SkillHealthConfig {
  idleSeconds?: number;
  stallSeconds?: number;
  loopDetectionWindow?: number;
  loopThreshold?: number;
  errorThreshold?: number;
  distressSeconds?: number;
}

// --- Skill Visibility ---

export interface SkillVisibility {
  paths?: string[];         // glob patterns for project relevance
  autoLoad?: boolean;       // whether Claude can auto-discover via description
}

// --- Buildor Skills (from ~/.buildor/skills/) ---

export interface BuildorSkill {
  // From skill.json
  name: string;
  description: string;
  tags?: string[];
  params?: SkillParam[];
  execution?: SkillExecution;
  visibility?: SkillVisibility;
  shell?: 'bash' | 'powershell';
  scope?: 'general' | 'project';
  projects?: string[];

  // Resolved at load time
  skillDir: string;                   // absolute path to skill directory
  promptContent: string;              // raw prompt.md content (pre-processing at invoke time)
  supportingFiles?: string[];         // other files in the skill directory
  lastModified?: number;              // epoch ms, for cache invalidation
}

// --- Project Skills (from .claude/skills/) ---

export interface ProjectSkill {
  name: string;
  description: string;               // parsed from SKILL.md frontmatter
  source: 'project' | 'personal';    // .claude/skills/ vs ~/.claude/skills/
  skillDir: string;                   // absolute path (read-only display)
  hasFork: boolean;                   // true if SKILL.md has context: fork
}

// --- Union for palette rendering ---

export type PaletteSkill =
  | { type: 'buildor'; skill: BuildorSkill }
  | { type: 'project'; skill: ProjectSkill };

// --- Skill execution record (for history markers) ---

export interface SkillExecutionRecord {
  skillName: string;
  skillDescription?: string;
  skillSource: 'buildor' | 'project';
  params?: Record<string, string | number | boolean>;
  timestamp: string;
}
