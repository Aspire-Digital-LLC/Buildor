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
  let skillsBlock: string | null = null;
  if (activeSkills && activeSkills.length > 0) {
    const skillLines = activeSkills.map(
      (s) => `- **${s.name}**: ${s.description}\n  Full content: \`${s.skillDir}/prompt.md\` (read with Read tool when relevant)`
    ).join('\n');
    skillsBlock = `## Available Buildor Skills\nThe following skills are activated. Read the full skill content when relevant:\n${skillLines}`;
  }

  return contextOnStart(
    buildorContext,
    personalityBlock,
    skillsBlock,
    ...extra,
  );
}
