import {
  listChatSessions,
  getChatMessages,
  generateChatSummary,
  type ChatSession,
  type ChatMessageRecord,
} from '@/utils/commands/chatHistory';

const MAX_TOTAL_CHARS = 50000;
const SMALL_SESSION_THRESHOLD = 30; // messages

function formatMessageForContext(msg: ChatMessageRecord): string | null {
  // Skip system messages (Buildor UI chrome) and tool-use/thinking/permission blocks
  if (msg.role === 'system') return null;

  const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
  const parts: string[] = [];
  try {
    const content = JSON.parse(msg.contentJson);
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          parts.push(block.text);
        } else if (block.type === 'tool_result' && block.content) {
          // Truncate large tool results to keep injection lean
          const result = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          parts.push(`[Tool result]: ${result.length > 2000 ? result.slice(0, 2000) + '...(truncated)' : result}`);
        }
        // Skip: tool_use, thinking, permission_request
      }
    } else {
      parts.push(msg.contentJson);
    }
  } catch {
    parts.push(msg.contentJson);
  }
  if (parts.length === 0) return null;
  return `${role}: ${parts.join('\n')}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function buildSessionContext(session: ChatSession): Promise<string> {
  const header = `--- Session: "${session.title || 'Untitled'}" (${formatDate(session.startedAt)}, ${session.messageCount} msgs, branch: ${session.branchName}) ---`;

  if (session.messageCount <= SMALL_SESSION_THRESHOLD) {
    // Small session: inject full transcript
    const messages = await getChatMessages(session.id);
    const transcript = messages.map(formatMessageForContext).filter(Boolean).join('\n\n');
    return `${header}\n[INJECTION MODE: FULL — complete transcript included]\n\n${transcript}`;
  }

  // Large session: summary + last 10%
  let summary: string;
  if (session.cachedSummary) {
    summary = session.cachedSummary;
  } else {
    summary = await generateChatSummary(session.id);
  }

  // Get last 10% of messages
  const last10Pct = Math.max(3, Math.ceil(session.messageCount * 0.1));
  const offset = Math.max(0, session.messageCount - last10Pct);
  const recentMessages = await getChatMessages(session.id, last10Pct, offset);
  const recentTranscript = recentMessages.map(formatMessageForContext).filter(Boolean).join('\n\n');

  return `${header}\n[INJECTION MODE: PARTIAL — summary of full conversation + verbatim last ~10%. If the user references something you cannot find in this context, it may be in the compressed portion. Let them know and suggest they check the full transcript in the History panel.]\n\n[SUMMARY]\n${summary}\n\n[RECENT MESSAGES (last ${last10Pct} of ${session.messageCount})]\n${recentTranscript}`;
}

export async function buildAwareContext(sessionIds: string[], projectName: string, worktreeSessionId?: string | null): Promise<string> {
  if (sessionIds.length === 0) return '';

  // Fetch session metadata
  const allSessions = await listChatSessions(projectName, worktreeSessionId || null);
  const selectedSessions = allSessions.filter((s) => sessionIds.includes(s.id));

  if (selectedSessions.length === 0) return '';

  const parts: string[] = [];
  let totalChars = 0;

  for (const session of selectedSessions) {
    const ctx = await buildSessionContext(session);
    totalChars += ctx.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      parts.push(`--- Session: "${session.title || 'Untitled'}" ---\n[SKIPPED — total context size limit reached]`);
      break;
    }
    parts.push(ctx);
  }

  return `[CONTEXT FROM PREVIOUS SESSIONS — The user has made you "aware" of these past conversations. Use this context to inform your responses.]\n\n${parts.join('\n\n')}\n\n[END OF PREVIOUS SESSION CONTEXT]\n\n`;
}
