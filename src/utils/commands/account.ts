import { invoke } from '@tauri-apps/api/core';

export async function openLoginWindow(): Promise<void> {
  return invoke('open_login_window');
}

export async function fetchClaudeUsage(): Promise<string> {
  return invoke('fetch_claude_usage');
}

export async function hasClaudeSession(): Promise<boolean> {
  return invoke('has_claude_session');
}

export async function clearClaudeSession(): Promise<void> {
  return invoke('clear_claude_session');
}

export async function triggerCliLogin(): Promise<string> {
  return invoke('trigger_cli_login');
}
