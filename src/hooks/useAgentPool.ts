import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { listAgents, markAgentExited, injectIntoAgent } from '@/utils/commands/agents';
import { respondToPermission } from '@/utils/commands/claude';
import { getChatMessages, type ChatMessageRecord } from '@/utils/commands/chatHistory';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
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

  // Track accumulated output per agent session and cleanup listeners
  const agentOutputRef = useRef<Map<string, string>>(new Map());
  const agentListenersRef = useRef<Map<string, () => void>>(new Map());

  // Initial load from backend
  useEffect(() => {
    listAgents().then((agents) => {
      const map = new Map<string, AgentPoolEntry>();
      for (const a of agents) map.set(a.sessionId, a);
      setPool(map);
    }).catch(() => {});
  }, []);

  // Cleanup all agent listeners on unmount
  useEffect(() => {
    return () => {
      for (const cleanup of agentListenersRef.current.values()) {
        cleanup();
      }
      agentListenersRef.current.clear();
      agentOutputRef.current.clear();
    };
  }, []);

  // Subscribe to agent events
  useEffect(() => {
    const onRegistered = (event: BuildorEvent) => {
      const data = event.data as { agentSessionId?: string; name?: string; prompt?: string };
      const agentSid = data.agentSessionId;
      const agentPrompt = data.prompt;

      // Refresh pool from backend — agent is now registered in Rust pool
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);
      }).catch(() => {});

      // Set up output capture + exit listener for this agent
      if (agentSid) {
        agentOutputRef.current.set(agentSid, '');

        let unlistenOutput: UnlistenFn | null = null;
        let unlistenExit: UnlistenFn | null = null;

        const setupListeners = async () => {
          unlistenOutput = await listen<string>(`claude-output-${agentSid}`, (evt) => {
            // Parse raw JSON for status updates BEFORE calling parseStreamEvent
            // (parseStreamEvent returns null for content_block_start which is the
            // primary source of real-time tool activity)
            try {
              const raw = JSON.parse(evt.payload);

              // content_block_start with tool_use = real-time tool activity
              if (raw.type === 'content_block_start' && raw.content_block?.type === 'tool_use') {
                setStatusLines((prev) => {
                  const next = new Map(prev);
                  next.set(agentSid, deriveStatusLine({
                    toolName: raw.content_block.name,
                    input: raw.content_block.input,
                  }));
                  return next;
                });
              }

              // Auto-accept agent permission requests — agents are autonomous workers
              if (
                (raw.type === 'control_request' && raw.request?.subtype === 'can_use_tool') ||
                raw.type === 'permission_request' || raw.type === 'permission'
              ) {
                const requestId = raw.request_id || raw.id || '';
                const toolInput = raw.request?.input || raw.tool?.input || raw.permission?.input || undefined;
                if (requestId) {
                  respondToPermission(agentSid, requestId, true, toolInput).catch(() => {});
                  setStatusLines((prev) => {
                    const next = new Map(prev);
                    const toolName = raw.request?.tool_name || raw.tool?.name || 'tool';
                    next.set(agentSid, `Approved ${toolName}...`);
                    return next;
                  });
                }
              }

              // assistant message with text = agent is writing output
              if (raw.type === 'assistant' && raw.message?.content) {
                for (const block of raw.message.content) {
                  if (block.type === 'text' && block.text) {
                    setStatusLines((prev) => {
                      const next = new Map(prev);
                      next.set(agentSid, truncate(block.text, 60));
                      return next;
                    });
                  }
                  if (block.type === 'tool_use' && block.name) {
                    setStatusLines((prev) => {
                      const next = new Map(prev);
                      next.set(agentSid, deriveStatusLine({ toolName: block.name, input: block.input }));
                      return next;
                    });
                  }
                }
              }
            } catch { /* not JSON, ignore */ }

            // Still call parseStreamEvent for event emission + output accumulation
            const parsed = parseStreamEvent(evt.payload, agentSid);
            if (parsed?.role === 'assistant') {
              const textBlocks = parsed.content
                .filter((b) => b.type === 'text' && b.text)
                .map((b) => b.text)
                .join('\n');
              if (textBlocks) {
                agentOutputRef.current.set(agentSid, textBlocks);
              }
            }
          });

          unlistenExit = await listen<string>(`claude-exit-${agentSid}`, () => {
            const output = agentOutputRef.current.get(agentSid) || '';
            markAgentExited(agentSid, output.length > 0, output || undefined).catch(() => {});

            // Cleanup
            agentOutputRef.current.delete(agentSid);
            unlistenOutput?.();
            unlistenExit?.();
            agentListenersRef.current.delete(agentSid);
          });
        };

        const cleanupPromise = setupListeners().then(() => {
          // Send the initial prompt AFTER listeners are active
          // (Rust spawn_agent deliberately does NOT send it to avoid race condition)
          if (agentPrompt) {
            injectIntoAgent(agentSid, agentPrompt).catch(() => {});
          }
        });
        agentListenersRef.current.set(agentSid, () => {
          cleanupPromise.then(() => {
            unlistenOutput?.();
            unlistenExit?.();
          });
        });
      }
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

    // When a dependency-resolved event fires, a pending agent just spawned — refresh pool
    const onDependencyResolved = (_event: BuildorEvent) => {
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);
      }).catch(() => {});
    };

    buildorEvents.on('agent-registered', onRegistered);
    buildorEvents.on('agent-completed', onCompleted);
    buildorEvents.on('agent-failed', onFailed);
    buildorEvents.on('agent-health-changed', onHealthChanged);
    buildorEvents.on('agent-dependency-resolved', onDependencyResolved);
    buildorEvents.on('tool-executing', onToolExecuting);
    buildorEvents.on('message-received', onMessageReceived);

    return () => {
      buildorEvents.off('agent-registered', onRegistered);
      buildorEvents.off('agent-completed', onCompleted);
      buildorEvents.off('agent-failed', onFailed);
      buildorEvents.off('agent-health-changed', onHealthChanged);
      buildorEvents.off('agent-dependency-resolved', onDependencyResolved);
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
