import { invoke } from '@tauri-apps/api/core';

export async function getConfig(): Promise<string> {
  return invoke('get_config');
}

export async function setConfig(config: string): Promise<void> {
  return invoke('set_config', { config });
}

export async function scaffoldSharedRepo(repoPath: string): Promise<string[]> {
  return invoke('scaffold_shared_repo', { repoPath });
}

export async function checkForUpdate(): Promise<[string, string, boolean]> {
  return invoke('check_for_update');
}
