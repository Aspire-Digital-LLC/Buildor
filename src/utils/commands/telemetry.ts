import { invoke } from '@tauri-apps/api/core';

export async function subscribeTelemetry(
  sessionId: string,
  streams?: string[],
): Promise<void> {
  return invoke('subscribe_telemetry', { sessionId, streams });
}

export async function unsubscribeTelemetry(
  sessionId: string,
): Promise<void> {
  return invoke('unsubscribe_telemetry', { sessionId });
}
