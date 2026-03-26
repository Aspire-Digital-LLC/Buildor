import { invoke } from '@tauri-apps/api/core';

export async function listFlows(): Promise<string[]> {
  return invoke('list_flows');
}

export async function getFlow(name: string): Promise<string> {
  return invoke('get_flow', { name });
}

export async function executeFlow(name: string, params: string): Promise<void> {
  return invoke('execute_flow', { name, params });
}
