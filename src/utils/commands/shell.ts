import { invoke } from '@tauri-apps/api/core';

export async function executeShellCommand(
  command: string,
  cwd?: string,
): Promise<string> {
  return invoke('execute_shell_command', { command, cwd: cwd || null });
}
