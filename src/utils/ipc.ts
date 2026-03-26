import { invoke } from '@tauri-apps/api/core';

export const ipc = {
  async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  },
};
