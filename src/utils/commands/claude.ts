import { invoke } from '@tauri-apps/api/core';

export async function generateSlug(description: string): Promise<string> {
  return invoke('generate_slug', { description });
}

export async function startClaudeSession(workingDir: string): Promise<string> {
  return invoke('start_session', { workingDir });
}

export async function sendClaudeMessage(sessionId: string, message: string): Promise<string> {
  return invoke('send_message', { sessionId, message });
}

export async function getClaudeSessionStatus(sessionId: string): Promise<string> {
  return invoke('get_session_status', { sessionId });
}

export async function stopSession(sessionId: string): Promise<void> {
  return invoke('stop_session', { sessionId });
}

export async function listClaudeSessions(): Promise<string[]> {
  return invoke('list_claude_sessions');
}
