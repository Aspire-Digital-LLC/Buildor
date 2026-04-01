import { executeShellCommand } from '@/utils/commands/shell';
import type { BuildorSkill } from '@/types/skill';

/**
 * Skill Processor — Pre-processing pipeline for Buildor skill prompts.
 *
 * Steps:
 * 1. {{param}} substitution
 * 2. ${CLAUDE_SKILL_DIR} resolution
 * 3. !`command` shell execution
 * 4. Relative link resolution
 */

/** Replace {{param-name}} placeholders with values from the params record. */
export function substituteParams(
  template: string,
  params: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, paramName: string) => {
    const key = paramName.trim();
    if (key in params) {
      return String(params[key]);
    }
    // Leave unmatched placeholders as-is (they may be conditional blocks)
    return _match;
  });
}

/** Replace ${CLAUDE_SKILL_DIR} with the absolute path to the skill directory. */
export function resolveSkillDir(template: string, skillDir: string): string {
  return template.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
}

/**
 * Find all !`command` patterns, execute each via Rust backend, replace with output.
 * Handles both inline !`cmd` and block-level patterns.
 */
export async function executeShellBlocks(
  template: string,
  cwd?: string,
): Promise<string> {
  const shellPattern = /!`([^`]+)`/g;
  const matches: { full: string; command: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = shellPattern.exec(template)) !== null) {
    matches.push({ full: match[0], command: match[1] });
  }

  if (matches.length === 0) return template;

  let result = template;
  for (const { full, command } of matches) {
    try {
      const output = await executeShellCommand(command, cwd);
      result = result.replace(full, output);
    } catch (e) {
      result = result.replace(full, `[shell error: ${String(e)}]`);
    }
  }

  return result;
}

/**
 * Convert relative markdown links [text](relative.md) to absolute paths.
 * Only converts links that don't start with http/https/# and aren't already absolute.
 */
export function resolveRelativeLinks(template: string, skillDir: string): string {
  return template.replace(
    /\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, text: string, href: string) => {
      const trimmed = href.trim();
      // Skip URLs, anchors, and absolute paths
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('/') ||
        /^[a-zA-Z]:\\/.test(trimmed)
      ) {
        return _match;
      }
      // Convert to absolute path
      const separator = skillDir.includes('\\') ? '\\' : '/';
      const absolutePath = `${skillDir}${separator}${trimmed}`;
      return `[${text}](${absolutePath})`;
    },
  );
}

/**
 * Full processing pipeline: substitute params, resolve variables,
 * execute shell blocks, resolve relative links.
 */
export async function processSkillPrompt(
  skill: BuildorSkill,
  params: Record<string, string | number | boolean>,
): Promise<string> {
  let prompt = skill.promptContent;

  // 1. Param substitution
  prompt = substituteParams(prompt, params);

  // 2. Skill dir variable
  prompt = resolveSkillDir(prompt, skill.skillDir);

  // 3. Shell command execution
  prompt = await executeShellBlocks(prompt, skill.skillDir);

  // 4. Relative links
  prompt = resolveRelativeLinks(prompt, skill.skillDir);

  return prompt;
}
