import { invoke } from '@tauri-apps/api/core';

export interface ChatSession {
  id: string;
  projectName: string;
  repoPath: string;
  worktreeSessionId: string | null;
  branchName: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  cachedSummary: string | null;
}

export interface ChatMessageRecord {
  id: number | null;
  sessionId: string;
  seq: number;
  role: string;
  contentJson: string;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  isResult: boolean;
  createdAt: string;
}

export async function createChatSession(
  id: string,
  projectName: string,
  repoPath: string,
  worktreeSessionId: string | null,
  branchName: string,
): Promise<ChatSession> {
  return invoke('create_chat_session', {
    id,
    projectName,
    repoPath,
    worktreeSessionId,
    branchName,
  });
}

export async function endChatSession(sessionId: string): Promise<void> {
  return invoke('end_chat_session', { sessionId });
}

export async function saveChatMessage(
  sessionId: string,
  seq: number,
  role: string,
  contentJson: string,
  model?: string | null,
  costUsd?: number | null,
  durationMs?: number | null,
  isResult?: boolean,
): Promise<number> {
  return invoke('save_chat_message', {
    sessionId,
    seq,
    role,
    contentJson,
    model: model || null,
    costUsd: costUsd || null,
    durationMs: durationMs || null,
    isResult: isResult || null,
  });
}

export async function listChatSessions(
  projectName: string,
  worktreeSessionId?: string | null,
): Promise<ChatSession[]> {
  return invoke('list_chat_sessions', {
    projectName,
    worktreeSessionId: worktreeSessionId || null,
  });
}

export async function getChatMessages(
  sessionId: string,
  limit?: number,
  offset?: number,
): Promise<ChatMessageRecord[]> {
  return invoke('get_chat_messages', {
    sessionId,
    limit: limit || null,
    offset: offset || null,
  });
}

export async function updateChatSessionTitle(sessionId: string, title: string): Promise<void> {
  return invoke('update_chat_session_title', { sessionId, title });
}

export async function updateChatSessionSummary(sessionId: string, summary: string): Promise<void> {
  return invoke('update_chat_session_summary', { sessionId, summary });
}

export async function generateChatTitle(sessionId: string): Promise<string> {
  return invoke('generate_chat_title', { sessionId });
}

export async function generateChatSummary(sessionId: string): Promise<string> {
  return invoke('generate_chat_summary', { sessionId });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  return invoke('delete_chat_session', { sessionId });
}

export async function deleteChatHistoryForWorktree(worktreeSessionId: string): Promise<void> {
  return invoke('delete_chat_history_for_worktree', { worktreeSessionId });
}

export async function deleteChatHistoryForProject(projectName: string): Promise<void> {
  return invoke('delete_chat_history_for_project', { projectName });
}
