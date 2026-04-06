import { usePersonalityStore } from '@/stores';
import { getPersonalityById } from '@/personalities/personalities';
import buildorContext from '../../buildor_context.md?raw';

/**
 * Assemble a system prompt from multiple context sources.
 * Each source is either a string or null/undefined (skipped).
 * Sources are joined with a separator for clarity.
 *
 * Usage:
 *   contextOnStart(buildorIdentity, personalityPrompt, customInstructions)
 */
export function contextOnStart(...sources: (string | null | undefined)[]): string {
  return sources
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.trim())
    .join('\n\n---\n\n');
}

export interface ActiveSkillDescription {
  name: string;
  description: string;
  skillDir: string;
}

/**
 * Build the default system prompt for a Claude session.
 * Combines Buildor self-identity + selected personality + optional active skill descriptions.
 * Additional context strings can be appended.
 */
export function buildSystemPrompt(
  ...extra: (string | null | undefined)[]
): string;
export function buildSystemPrompt(
  options: { activeSkills?: ActiveSkillDescription[] },
  ...extra: (string | null | undefined)[]
): string;
export function buildSystemPrompt(
  ...args: unknown[]
): string {
  let activeSkills: ActiveSkillDescription[] | undefined;
  let extra: (string | null | undefined)[];

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0]) && 'activeSkills' in (args[0] as Record<string, unknown>)) {
    const opts = args[0] as { activeSkills?: ActiveSkillDescription[] };
    activeSkills = opts.activeSkills;
    extra = args.slice(1) as (string | null | undefined)[];
  } else {
    extra = args as (string | null | undefined)[];
  }

  const { selectedId, customPersonalities } = usePersonalityStore.getState();
  const personality = getPersonalityById(selectedId, customPersonalities);

  // Wrap personality in explicit framing so it doesn't get lost after the identity context
  const personalityBlock = personality?.prompt
    ? `## Communication Style (MUST follow)\nYour personality is set to "${personality.name}". This overrides your default tone for ALL responses:\n${personality.prompt}\nAlways respond in this style, even when describing yourself or Buildor features.`
    : null;

  // Build skill descriptions block if any skills are activated (eyeball mode)
  // Uses strong directive language so skills aren't drowned out by the large system prompt.
  let skillsBlock: string | null = null;
  if (activeSkills && activeSkills.length > 0) {
    const skillLines = activeSkills.map(
      (s) => `- **${s.name}**: ${s.description}\n  Skill directory: \`${s.skillDir}\`\n  Read \`${s.skillDir}/prompt.md\` for full instructions.`
    ).join('\n');
    skillsBlock = [
      `## ACTIVE BUILDOR SKILLS (MANDATORY)`,
      ``,
      `The following Buildor skills are activated. **You MUST evaluate every user request against these skill descriptions.** If a user's request matches what a skill does, you MUST:`,
      `1. Read the skill's \`prompt.md\` file (and any supporting files it references)`,
      `2. Use it as your primary methodology for responding — not freeform`,
      `3. Follow the skill's output format exactly`,
      ``,
      `Do NOT perform freeform responses for tasks that an active skill covers.`,
      ``,
      skillLines,
    ].join('\n');
  }

  return contextOnStart(
    buildorContext,
    personalityBlock,
    skillsBlock,
    ...extra,
  );
}
