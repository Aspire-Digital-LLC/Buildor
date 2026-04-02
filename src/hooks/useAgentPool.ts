import { useState, useEffect, useCallback, useMemo } from 'react';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { listAgents } from '@/utils/commands/agents';
import { getChatMessages, type ChatMessageRecord } from '@/utils/commands/chatHistory';
import type { AgentPoolEntry, AgentHealthState } from '@/types/agent';

export interface AgentPoolAgent extends AgentPoolEntry {
  /** Live one-line status derived from latest tool call or text */
  statusLine: string;
  /** Children agents (computed from parentSessionId) */
  children: AgentPoolAgent[];
}

export interface UseAgentPoolResult {
  agents: AgentPoolAgent[];
  activeCount: number;
  completedAgents: AgentPoolAgent[];
  expandedAgentId: string | null;
  expandAgent: (id: string | null) => void;
  getAgentMessages: (sessionId: string) => Promise<ChatMessageRecord[]>;
  refresh: () => void;
}

/** Derives a one-line status from event data */
function deriveStatusLine(data: Record<string, unknown>): string {
  const toolName = data.toolName as string | undefined;
  const input = data.input as Record<string, unknown> | undefined;

  if (toolName === 'Read' && input?.file_path) return `Reading ${basename(String(input.file_path))}...`;
  if (toolName === 'Edit' && input?.file_path) return `Editing ${basename(String(input.file_path))}...`;
  if (toolName === 'Write' && input?.file_path) return `Writing ${basename(String(input.file_path))}...`;
  if (toolName === 'Bash' && input?.command) return `Running ${truncate(String(input.command), 40)}...`;
  if (toolName === 'Grep') return `Searching...`;
  if (toolName === 'Glob') return `Finding files...`;
  if (toolName) return `${toolName}...`;

  const text = data.text as string | undefined;
  if (text) return truncate(text, 60);

  return 'Working...';
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function truncate(s: string, max: number): string {
  const line = s.split('\n')[0];
  return line.length > max ? line.slice(0, max) + '...' : line;
}

function healthIcon(state: AgentHealthState): string {
  switch (state) {
    case 'healthy': return 'spinning';
    case 'idle': return 'amber';
    case 'stalling': return 'amber';
    case 'looping': return 'amber';
    case 'erroring': return 'red';
    case 'distressed': return 'red';
    default: return 'spinning';
  }
}

export { healthIcon };

export function useAgentPool(): UseAgentPoolResult {
  const [pool, setPool] = useState<Map<string, AgentPoolEntry>>(new Map());
  const [statusLines, setStatusLines] = useState<Map<string, string>>(new Map());
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Initial load from backend
  useEffect(() => {
    listAgents().then((agents) => {
      const map = new Map<string, AgentPoolEntry>();
      for (const a of agents) map.set(a.sessionId, a);
      setPool(map);
    }).catch(() => {});
  }, []);

  // Subscribe to agent events
  useEffect(() => {
    const onSpawned = (_event: BuildorEvent) => {
      // Refresh pool from backend to get the actual AgentPoolEntry
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);
      }).catch(() => {});
    };

    const onCompleted = (event: BuildorEvent) => {
      const data = event.data as { agentSessionId?: string };
      if (data.agentSessionId) {
        setPool((prev) => {
          const next = new Map(prev);
          const entry = next.get(data.agentSessionId!);
          if (entry) {
            next.set(data.agentSessionId!, { ...entry, status: 'completed', endedAt: new Date().toISOString() });
          }
          return next;
        });
      }
      // Also refresh from backend for accuracy
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);
      }).catch(() => {});
    };

    const onFailed = (event: BuildorEvent) => {
      const data = event.data as { agentSessionId?: string };
      if (data.agentSessionId) {
        setPool((prev) => {
          const next = new Map(prev);
          const entry = next.get(data.agentSessionId!);
          if (entry) {
            next.set(data.agentSessionId!, { ...entry, status: 'failed', endedAt: new Date().toISOString() });
          }
          return next;
        });
      }
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);
      }).catch(() => {});
    };

    const onHealthChanged = (event: BuildorEvent) => {
      const data = event.data as { agentSessionId?: string; newState?: AgentHealthState };
      if (data.agentSessionId && data.newState) {
        setPool((prev) => {
          const next = new Map(prev);
          const entry = next.get(data.agentSessionId!);
          if (entry) {
            next.set(data.agentSessionId!, { ...entry, healthState: data.newState! });
          }
          return next;
        });
      }
    };

    const onToolExecuting = (event: BuildorEvent) => {
      // Update status line for the agent whose session this is
      if (event.sessionId) {
        setStatusLines((prev) => {
          const next = new Map(prev);
          next.set(event.sessionId!, deriveStatusLine(event.data as Record<string, unknown>));
          return next;
        });
      }
    };

    const onMessageReceived = (event: BuildorEvent) => {
      if (event.sessionId) {
        const data = event.data as { text?: string };
        if (data.text) {
          setStatusLines((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId!, truncate(data.text!, 60));
            return next;
          });
        }
      }
    };

    buildorEvents.on('agent-spawned', onSpawned);
    buildorEvents.on('agent-completed', onCompleted);
    buildorEvents.on('agent-failed', onFailed);
    buildorEvents.on('agent-health-changed', onHealthChanged);
    buildorEvents.on('tool-executing', onToolExecuting);
    buildorEvents.on('message-received', onMessageReceived);

    return () => {
      buildorEvents.off('agent-spawned', onSpawned);
      buildorEvents.off('agent-completed', onCompleted);
      buildorEvents.off('agent-failed', onFailed);
      buildorEvents.off('agent-health-changed', onHealthChanged);
      buildorEvents.off('tool-executing', onToolExecuting);
      buildorEvents.off('message-received', onMessageReceived);
    };
  }, []);

  // Build hierarchical agent list
  const { agents, completedAgents, activeCount } = useMemo(() => {
    const entries = Array.from(pool.values());
    const topLevel: AgentPoolAgent[] = [];

    // First pass: create AgentPoolAgent objects
    const agentMap = new Map<string, AgentPoolAgent>();
    for (const entry of entries) {
      const agent: AgentPoolAgent = {
        ...entry,
        statusLine: statusLines.get(entry.sessionId) || (entry.status === 'completed' ? 'Completed' : entry.status === 'failed' ? 'Failed' : 'Working...'),
        children: [],
      };
      agentMap.set(entry.sessionId, agent);
    }

    // Second pass: build hierarchy
    for (const agent of agentMap.values()) {
      if (agent.parentSessionId && agentMap.has(agent.parentSessionId)) {
        const parent = agentMap.get(agent.parentSessionId)!;
        parent.children.push(agent);
      } else {
        topLevel.push(agent);
      }
    }

    const active = topLevel.filter((a) => a.status === 'running');
    const completed = topLevel.filter((a) => a.status !== 'running');

    return {
      agents: active,
      completedAgents: completed,
      activeCount: entries.filter((a) => a.status === 'running').length,
    };
  }, [pool, statusLines]);

  const getAgentMessages = useCallback(async (sessionId: string): Promise<ChatMessageRecord[]> => {
    return getChatMessages(sessionId);
  }, []);

  const refresh = useCallback(() => {
    listAgents().then((agents) => {
      const map = new Map<string, AgentPoolEntry>();
      for (const a of agents) map.set(a.sessionId, a);
      setPool(map);
    }).catch(() => {});
  }, []);

  return {
    agents,
    activeCount,
    completedAgents,
    expandedAgentId,
    expandAgent: setExpandedAgentId,
    getAgentMessages,
    refresh,
  };
}
