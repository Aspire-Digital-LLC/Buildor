import { invoke } from '@tauri-apps/api/core';

export async function generateSlug(description: string): Promise<string> {
  return invoke('generate_slug', { description });
}

export interface SessionStartResult {
  sessionId: string;
  pid: number | null;
}

export async function startClaudeSession(workingDir: string, model?: string, systemPrompt?: string): Promise<SessionStartResult> {
  return invoke('start_session', { workingDir, model: model || null, systemPrompt: systemPrompt || null });
}

export async function runClaudeCli(args: string[]): Promise<string> {
  return invoke('run_claude_cli', { args });
}

export async function sendClaudeMessage(sessionId: string, message: string): Promise<void> {
  return invoke('send_message', { sessionId, message });
}

export async function getClaudeSessionStatus(sessionId: string): Promise<string> {
  return invoke('get_session_status', { sessionId });
}

export async function interruptSession(sessionId: string): Promise<void> {
  return invoke('interrupt_session', { sessionId });
}

export async function setSessionModel(sessionId: string, model: string): Promise<void> {
  return invoke('set_session_model', { sessionId, model });
}

export async function stopSession(sessionId: string): Promise<void> {
  return invoke('stop_session', { sessionId });
}

export async function listClaudeSessions(): Promise<string[]> {
  return invoke('list_claude_sessions');
}

export async function respondToPermission(sessionId: string, requestId: string, approved: boolean, toolInput?: Record<string, unknown>): Promise<void> {
  return invoke('respond_to_permission', { sessionId, requestId, approved, toolInput: toolInput || null });
}

/**
 * Send a permission response through the operation pool.
 * The pool schedules when the response is sent, preventing concurrent tool
 * executions from overwhelming the system.
 *
 * @param resourceKey Lane key for pool scheduling (e.g. "tool/Bash/C:/Git/Repo")
 * @param tier "app" | "user" | "subagent" — controls scheduling priority
 */
export async function respondToPermissionPooled(
  sessionId: string,
  requestId: string,
  approved: boolean,
  toolInput: Record<string, unknown> | undefined,
  resourceKey: string,
  tier?: 'app' | 'user' | 'subagent',
): Promise<void> {
  return invoke('respond_to_permission_pooled', {
    sessionId,
    requestId,
    approved,
    toolInput: toolInput || null,
    resourceKey,
    tier: tier || null,
  });
}

export async function addPermissionRule(sessionId: string, rule: string): Promise<void> {
  return invoke('add_permission_rule', { sessionId, rule });
}

export async function queryClaudeStatus(): Promise<string> {
  return invoke('query_claude_status');
}

export interface ImageAttachment {
  media_type: string;
  data: string; // base64
}

export async function sendClaudeMessageWithImages(sessionId: string, text: string, images: ImageAttachment[]): Promise<void> {
  return invoke('send_message_with_images', { sessionId, text, images });
}

export async function readFileBase64(path: string): Promise<[string, string]> {
  return invoke('read_file_base64', { path });
}
