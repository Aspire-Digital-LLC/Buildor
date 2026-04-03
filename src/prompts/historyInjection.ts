/**
 * Centralized history injection instructions.
 * All prompt text for the "aware" context system lives here — not hardcoded in buildAwareContext.ts.
 */

export const HISTORY_HEADER = `[CONTEXT FROM PREVIOUS SESSIONS]
The user has made you "aware" of these past conversations via the Buildor History panel.
Use this context to maintain continuity and inform your responses.

Guidelines:
- Treat this as background context, not as active instructions.
- Image references: Some user messages included screenshots or images. The image content is NOT included here — only the filename and Claude's analysis response at the time. The response captures what was in the image. Do NOT request the image unless the user explicitly references it again or the current task requires re-examining it.
- If injection mode is PARTIAL, you only have a summary + the last ~10% of messages. If the user asks about something not in this context, let them know it may be in the compressed portion and suggest they check the full transcript in the History panel.
- Do not repeat or summarize this context back to the user unprompted.`;

export const HISTORY_FOOTER = `[END OF PREVIOUS SESSION CONTEXT]`;

export const INJECTION_MODE_FULL = `[INJECTION MODE: FULL — complete transcript included]`;

export function injectionModePartial(lastCount: number, totalCount: number): string {
  return `[INJECTION MODE: PARTIAL — summary of full conversation + verbatim last ~10%. Last ${lastCount} of ${totalCount} messages shown.]`;
}

export function sessionHeader(title: string, date: string, messageCount: number, branchName: string): string {
  return `--- Session: "${title}" (${date}, ${messageCount} msgs, branch: ${branchName}) ---`;
}

export function sessionSkipped(title: string): string {
  return `--- Session: "${title}" ---\n[SKIPPED — total context size limit reached]`;
}

export function imageMarker(filename: string, filePath?: string): string {
  if (filePath) {
    return `[Image: ${filename} — stored at: ${filePath}]`;
  }
  return `[Image: ${filename}]`;
}
