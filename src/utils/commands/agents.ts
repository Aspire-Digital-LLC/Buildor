import { invoke } from '@tauri-apps/api/core';
import type { AgentPoolEntry, AgentReturnMode } from '@/types/agent';

export async function spawnAgent(
  workingDir: string,
  prompt: string,
  name: string,
  parentSessionId: string | null,
  returnTo: string | null,
  sourceSkill: string | null,
  model: string | null,
  returnMode: AgentReturnMode,
  outputPath: string | null,
): Promise<string> {
  return invoke('spawn_agent', {
    workingDir,
    prompt,
    name,
    parentSessionId,
    returnTo,
    sourceSkill,
    model,
    returnMode,
    outputPath,
  });
}

export async function killAgent(
  sessionId: string,
  markCompleted?: boolean,
): Promise<void> {
  return invoke('kill_agent', {
    sessionId,
    markCompleted: markCompleted ?? null,
  });
}

export async function extendAgent(
  sessionId: string,
  seconds?: number,
): Promise<void> {
  return invoke('extend_agent', {
    sessionId,
    seconds: seconds ?? null,
  });
}

export async function listAgents(): Promise<AgentPoolEntry[]> {
  return invoke('list_agents');
}

export async function getAgentStatus(sessionId: string): Promise<AgentPoolEntry> {
  return invoke('get_agent_status', { sessionId });
}
