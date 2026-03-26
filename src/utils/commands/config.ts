import { invoke } from '@tauri-apps/api/core';

export async function getConfig(): Promise<string> {
  return invoke('get_config');
}

export async function setConfig(config: string): Promise<void> {
  return invoke('set_config', { config });
}
