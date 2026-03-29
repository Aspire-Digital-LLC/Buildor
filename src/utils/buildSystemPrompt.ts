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

/**
 * Build the default system prompt for a Claude session.
 * Combines Buildor self-identity + selected personality.
 * Additional context strings can be appended.
 */
export function buildSystemPrompt(...extra: (string | null | undefined)[]): string {
  const { selectedId, customPersonalities } = usePersonalityStore.getState();
  const personality = getPersonalityById(selectedId, customPersonalities);

  return contextOnStart(
    buildorContext,
    personality?.prompt,
    ...extra,
  );
}
