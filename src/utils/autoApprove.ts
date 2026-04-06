import { getConfig, setConfig } from './commands/config';

/**
 * Buildor-managed auto-approve rules for tool permissions.
 *
 * These replace Claude's settings.local.json allow list. All tool calls
 * still flow through the operation pool — auto-approved tools just skip
 * the UI permission card.
 *
 * Rule format matches Claude's pattern syntax:
 * - "Read" — approve all Read calls
 * - "Bash(git:*)" — approve Bash calls starting with "git"
 * - "Edit" — approve all Edit calls
 */

let cachedRules: string[] | null = null;

/** Load auto-approve rules from Buildor config. */
export async function getAutoApproveRules(): Promise<string[]> {
  if (cachedRules !== null) return cachedRules;
  try {
    const raw = await getConfig();
    const config = JSON.parse(raw);
    const rules: string[] = config.autoApproveRules || [];
    cachedRules = rules;
    return rules;
  } catch {
    return [];
  }
}

/** Save auto-approve rules to Buildor config. */
export async function saveAutoApproveRules(rules: string[]): Promise<void> {
  try {
    const raw = await getConfig();
    const config = JSON.parse(raw);
    config.autoApproveRules = rules;
    await setConfig(JSON.stringify(config, null, 2));
    cachedRules = rules;
  } catch {
    // best-effort
  }
}

/** Add a rule if it doesn't already exist. */
export async function addAutoApproveRule(rule: string): Promise<void> {
  const rules = await getAutoApproveRules();
  if (!rules.includes(rule)) {
    rules.push(rule);
    await saveAutoApproveRules(rules);
  }
}

/** Remove a specific rule. */
export async function removeAutoApproveRule(rule: string): Promise<void> {
  const rules = await getAutoApproveRules();
  const filtered = rules.filter((r) => r !== rule);
  if (filtered.length !== rules.length) {
    await saveAutoApproveRules(filtered);
  }
}

/** Invalidate cache (call after external config changes). */
export function invalidateAutoApproveCache(): void {
  cachedRules = null;
}

/**
 * Check if a tool permission matches any auto-approve rule.
 *
 * Matching logic (same as Claude's permission system):
 * - "ToolName" matches any call to that tool
 * - "Bash(prefix:*)" matches Bash calls where the command starts with prefix
 * - "Read(path/pattern)" matches Read calls to matching paths (not implemented yet)
 */
export function matchesAutoApproveRule(
  rules: string[],
  toolName: string,
  input?: Record<string, unknown>,
): boolean {
  for (const rule of rules) {
    // Exact tool name match: "Read", "Edit", "Grep", etc.
    if (rule === toolName) return true;

    // Pattern match: "Bash(git:*)" or "Bash(npm:*)"
    const parenMatch = rule.match(/^(\w+)\((.+)\)$/);
    if (parenMatch) {
      const [, ruleTool, pattern] = parenMatch;
      if (ruleTool !== toolName) continue;

      if (toolName === 'Bash' && input?.command) {
        const cmd = String(input.command);
        // "git:*" -> matches commands starting with "git"
        if (pattern.endsWith(':*')) {
          const prefix = pattern.slice(0, -2);
          if (cmd.startsWith(prefix)) return true;
        }
        // Exact command match
        if (cmd === pattern) return true;
      }

      // Generic input matching for other tools
      if (toolName === 'Read' && input?.file_path) {
        if (pattern.endsWith('**')) {
          const prefix = pattern.slice(0, -2);
          if (String(input.file_path).startsWith(prefix)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Derive an auto-approve rule from a tool permission.
 * Used by "Always Allow" button to create the most useful rule.
 */
export function deriveAutoApproveRule(toolName: string, input?: Record<string, unknown>): string {
  if (toolName === 'Bash' && input?.command) {
    const cmd = String(input.command);
    const baseCmd = cmd.split(' ')[0];
    return `Bash(${baseCmd}:*)`;
  }
  // For all other tools, approve the tool entirely
  return toolName;
}
