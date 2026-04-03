import { invoke } from '@tauri-apps/api/core';
import type { MailboxEntry, AgentReturnMode } from '@/types/agent';

export async function depositResult(entry: MailboxEntry): Promise<void> {
  return invoke('deposit_result', {
    sessionId: entry.sessionId,
    name: entry.name,
    parentSessionId: entry.parentSessionId,
    status: entry.status,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    output: entry.output,
    outputPath: entry.outputPath,
    returnMode: entry.returnMode,
    durationMs: entry.durationMs,
    model: entry.model,
  });
}

export async function queryResult(sessionId: string): Promise<MailboxEntry | null> {
  return invoke('query_result', { sessionId });
}

export async function queryResultsByParent(parentSessionId: string): Promise<MailboxEntry[]> {
  return invoke('query_results_by_parent', { parentSessionId });
}

export async function queryResultByName(
  name: string,
  parentSessionId?: string,
): Promise<MailboxEntry | null> {
  return invoke('query_result_by_name', { name, parentSessionId: parentSessionId ?? null });
}

export async function purgeResults(parentSessionId: string): Promise<number> {
  return invoke('purge_results', { parentSessionId });
}

export async function spawnAgentWithDeps(
  workingDir: string,
  prompt: string,
  name: string,
  parentSessionId: string | null,
  returnTo: string | null,
  sourceSkill: string | null,
  model: string | null,
  returnMode: AgentReturnMode,
  outputPath: string | null,
  dependencies: string[],
): Promise<string> {
  return invoke('spawn_agent_with_deps', {
    workingDir,
    prompt,
    name,
    parentSessionId,
    returnTo,
    sourceSkill,
    model,
    returnMode,
    outputPath,
    dependencies,
  });
}
