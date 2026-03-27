import { invoke } from '@tauri-apps/api/core';

export async function openClaudeWindow(params: {
  label: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
}): Promise<void> {
  return invoke('open_claude_window', params);
}

export async function closeBreakoutWindow(label: string): Promise<void> {
  return invoke('close_breakout_window', { label });
}
