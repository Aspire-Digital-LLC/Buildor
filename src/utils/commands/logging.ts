import { invoke } from '@tauri-apps/api/core';
import type { LogEntry } from '@/types';

export async function logEvent(params: {
  sessionId?: string;
  repo?: string;
  functionArea: string;
  level: string;
  operation: string;
  message: string;
  details?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
}): Promise<number> {
  return invoke('log_event', params);
}

export async function getLogs(params?: {
  repo?: string;
  functionArea?: string;
  level?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}): Promise<LogEntry[]> {
  return invoke('get_logs', params || {});
}

export async function clearLogs(): Promise<void> {
  return invoke('clear_logs');
}
