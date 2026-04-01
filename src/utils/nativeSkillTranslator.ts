import type { BuildorSkill, ProjectSkill } from '@/types/skill';

/**
 * Native Skill Translator — Runtime translation of SKILL.md → BuildorSkill format.
 *
 * Reads a native Claude Code SKILL.md file, parses YAML frontmatter and markdown body,
 * and maps it to a BuildorSkill object in memory. The original file is never modified.
 */

interface ParsedSkillMd {
  frontmatter: Record<string, string>;
  body: string;
}

/** Parse YAML frontmatter and body from a SKILL.md file content. */
function parseSkillMd(content: string): ParsedSkillMd {
  const frontmatter: Record<string, string> = {};
  let body = content;

  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      const fmBlock = content.substring(3, endIdx).trim();
      body = content.substring(endIdx + 3).trim();

      for (const line of fmBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim()
          .replace(/^["']|["']$/g, ''); // Strip quotes
        if (key && value) {
          frontmatter[key] = value;
        }
      }
    }
  }

  return { frontmatter, body };
}

/** Check if a translated BuildorSkill has minimum valid fields. */
function isMinimallyValid(skill: BuildorSkill): boolean {
  return !!(skill.name && skill.description && skill.promptContent);
}

/**
 * Translate a native ProjectSkill (SKILL.md) into a BuildorSkill format in memory.
 * Never writes to disk, never modifies the original file.
 *
 * Default values for missing fields:
 * - description: skill name
 * - execution.model: undefined (uses current session model)
 * - execution.effort: "medium"
 * - params: empty (any $ARGUMENTS in body mapped to a single text param)
 * - tags: empty
 * - visibility.autoLoad: true
 * - shell: "bash"
 */
export function translateNativeSkill(
  projectSkill: ProjectSkill,
  skillMdContent: string,
): BuildorSkill {
  const { frontmatter, body } = parseSkillMd(skillMdContent);

  // Map $ARGUMENTS to a single text param if present in the body
  const hasArguments = body.includes('$ARGUMENTS');
  const params = hasArguments
    ? [{
        name: 'arguments',
        type: 'text' as const,
        required: false,
        description: 'Arguments to pass to the skill',
        placeholder: 'Enter arguments...',
      }]
    : [];

  // Determine context from frontmatter
  const context = frontmatter['context'] === 'fork' ? 'fork' as const : undefined;

  const translated: BuildorSkill = {
    name: projectSkill.name,
    description: frontmatter['description'] || projectSkill.description || projectSkill.name,
    tags: [],
    params,
    execution: {
      context,
      agent: frontmatter['agent'] || 'general-purpose',
      model: frontmatter['model'] || undefined,
      effort: (frontmatter['effort'] as BuildorSkill['execution'])?.effort || 'medium',
      allowedTools: [],
      returnMode: 'summary',
    },
    visibility: {
      autoLoad: true,
    },
    shell: 'bash',
    skillDir: projectSkill.skillDir,
    promptContent: hasArguments
      ? body.replace(/\$ARGUMENTS/g, '{{arguments}}')
      : body,
  };

  // Validation with fallback
  if (!isMinimallyValid(translated)) {
    return {
      name: projectSkill.name,
      description: projectSkill.name,
      skillDir: projectSkill.skillDir,
      promptContent: body || `# ${projectSkill.name}`,
    };
  }

  return translated;
}
