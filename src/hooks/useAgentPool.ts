import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { listAgents, markAgentExited, injectIntoAgent } from '@/utils/commands/agents';
import { respondToPermission, sendClaudeMessage } from '@/utils/commands/claude';
import { getChatMessages, saveChatMessage, createChatSession, type ChatMessageRecord } from '@/utils/commands/chatHistory';
import { updateAgentDraft } from '@/utils/commands/mailbox';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { logEvent } from '@/utils/commands/logging';
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


export function useAgentPool(parentSessionId?: string | null): UseAgentPoolResult {
  const [pool, setPool] = useState<Map<string, AgentPoolEntry>>(new Map());
  const [statusLines, setStatusLines] = useState<Map<string, string>>(new Map());
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Track accumulated output per agent session and cleanup listeners
  const agentOutputRef = useRef<Map<string, string>>(new Map());
  const agentListenersRef = useRef<Map<string, () => void>>(new Map());
  const agentSeqRef = useRef<Map<string, number>>(new Map()); // message sequence counters
  const agentDraftTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map()); // debounce timers
  // Track agent metadata for dual-writing to root parent session
  const agentMetaRef = useRef<Map<string, { rootSessionId: string; agentName: string }>>(new Map());

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
      agentMetaRef.current.clear();
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
        agentSeqRef.current.set(agentSid, 0);

        // Resolve root parent session (walk up the agent chain)
        // event.sessionId is the direct parent — which may itself be an agent
        const directParent = event.sessionId || null;
        const agentName = data.name || 'agent';
        if (directParent) {
          const parentMeta = agentMetaRef.current.get(directParent);
          const rootSessionId = parentMeta ? parentMeta.rootSessionId : directParent;
          agentMetaRef.current.set(agentSid, { rootSessionId, agentName });
        }

        // Create a chat session record for this agent (enables transcript viewer)
        createChatSession(
          agentSid,
          '', // projectName — will be filled by pool lookup
          '', // repoPath
          null, // worktreeSessionId
          '', // branchName
          'agent',
          event.sessionId || null, // parentSessionId from the event's session context
          event.sessionId || null, // returnTo
          null, // sourceSkill
          'buildor', // agentSource
        ).catch(() => {}); // Ignore if session already exists

        let unlistenOutput: UnlistenFn | null = null;
        let unlistenExit: UnlistenFn | null = null;

        const setupListeners = async () => {
          unlistenOutput = await listen<string>(`claude-output-${agentSid}`, (evt) => {
            let raw: Record<string, unknown> | null = null;
            try {
              raw = JSON.parse(evt.payload as string);
            } catch { /* ignore parse failures */ }

            if (raw) {
              // ── Result detection — agent completed its turn ──
              if (raw.type === 'result') {
                const success = raw.subtype === 'success';
                const output = agentOutputRef.current.get(agentSid) || '';
                markAgentExited(agentSid, success, output || undefined).catch(() => {});
                // Bridge to JS event bus — Rust emits buildor-event but nothing listens for it
                // Include output so onCompleted can inject result back to parent
                buildorEvents.emit(success ? 'agent-completed' : 'agent-failed', { agentSessionId: agentSid, output }, agentSid);
                import('@/utils/commands/claude').then(({ stopSession }) => {
                  stopSession(agentSid).catch(() => {});
                });
                agentOutputRef.current.delete(agentSid);
                agentSeqRef.current.delete(agentSid);
                const draftTimer = agentDraftTimerRef.current.get(agentSid);
                if (draftTimer) { clearTimeout(draftTimer); agentDraftTimerRef.current.delete(agentSid); }
                unlistenOutput?.();
                unlistenExit?.();
                agentListenersRef.current.delete(agentSid);
                return;
              }

              // ── content_block_delta — text streaming ──
              if (raw.type === 'content_block_delta' && (raw.delta as Record<string, unknown>)?.text) {
                buildorEvents.emit('message-received', { text: (raw.delta as Record<string, unknown>).text }, agentSid);
              }

              // ── content_block_start — text block beginning ──
              else if (raw.type === 'content_block_start' && (raw.content_block as Record<string, unknown>)?.type === 'text') {
                buildorEvents.emit('message-received', { text: '(generating...)' }, agentSid);
              }

              // ── content_block_start — tool_use activity ──
              else if (raw.type === 'content_block_start' && (raw.content_block as Record<string, unknown>)?.type === 'tool_use') {
                const block = raw.content_block as Record<string, unknown>;
                setStatusLines((prev) => {
                  const next = new Map(prev);
                  next.set(agentSid, deriveStatusLine({ toolName: block.name, input: block.input }));
                  return next;
                });
              }

              // ── Permission requests — auto-approve ──
              else if (
                (raw.type === 'control_request' && (raw.request as Record<string, unknown>)?.subtype === 'can_use_tool') ||
                raw.type === 'permission_request' || raw.type === 'permission'
              ) {
                const requestId = (raw.request_id || raw.id || '') as string;
                const reqObj = raw.request as Record<string, unknown> | undefined;
                const toolObj = raw.tool as Record<string, unknown> | undefined;
                const permObj = raw.permission as Record<string, unknown> | undefined;
                const toolInput = reqObj?.input || toolObj?.input || permObj?.input || undefined;
                if (requestId) {
                  respondToPermission(agentSid, requestId, true, toolInput as Record<string, unknown> | undefined).catch(() => {});
                  setStatusLines((prev) => {
                    const next = new Map(prev);
                    const toolName = reqObj?.tool_name || toolObj?.name || 'tool';
                    next.set(agentSid, `Approved ${String(toolName)}...`);
                    return next;
                  });
                }
              }

              // ── assistant message — complete message with content blocks ──
              else if (raw.type === 'assistant' && (raw.message as Record<string, unknown>)?.content) {
                const content = (raw.message as Record<string, unknown>).content as Array<Record<string, unknown>>;
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    setStatusLines((prev) => {
                      const next = new Map(prev);
                      next.set(agentSid, truncate(String(block.text), 60));
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

              // Unhandled event types — no action needed
            }

            // Still call parseStreamEvent for event emission + output accumulation
            const parsed = parseStreamEvent(evt.payload, agentSid);
            if (parsed) {
              // Persist to SQLite for transcript viewer (agent's own session)
              const seq = (agentSeqRef.current.get(agentSid) || 0) + 1;
              agentSeqRef.current.set(agentSid, seq);
              saveChatMessage(
                agentSid, seq, parsed.role,
                JSON.stringify(parsed.content),
                parsed.model || null,
              ).catch(() => {});

              // Dual-write to root parent session with hierarchy metadata
              // Uses Date.now() as seq — always higher than parent's sequential ints (1,2,3...)
              // so agent messages interleave correctly by temporal order
              const meta = agentMetaRef.current.get(agentSid);
              if (meta) {
                saveChatMessage(
                  meta.rootSessionId, Date.now(), parsed.role,
                  JSON.stringify(parsed.content),
                  parsed.model || null,
                  null, // costUsd
                  null, // durationMs
                  false, // isResult
                  agentSid, // sourceAgentId — enables hierarchy reconstruction
                  meta.agentName, // agentName
                ).catch(() => {});
              }

              // Accumulate text output for mailbox
              if (parsed.role === 'assistant') {
                const textBlocks = parsed.content
                  .filter((b) => b.type === 'text' && b.text)
                  .map((b) => b.text)
                  .join('\n');
                if (textBlocks) {
                  agentOutputRef.current.set(agentSid, textBlocks);

                  // Debounced draft update to mailbox (every 10s)
                  const existingTimer = agentDraftTimerRef.current.get(agentSid);
                  if (existingTimer) clearTimeout(existingTimer);
                  const timer = setTimeout(() => {
                    const currentOutput = agentOutputRef.current.get(agentSid);
                    if (currentOutput) {
                      updateAgentDraft(agentSid, currentOutput).catch(() => {});
                    }
                    agentDraftTimerRef.current.delete(agentSid);
                  }, 10_000);
                  agentDraftTimerRef.current.set(agentSid, timer);
                }
              }
            }
          });

          unlistenExit = await listen<string>(`claude-exit-${agentSid}`, () => {
            const output = agentOutputRef.current.get(agentSid) || '';
            const exitSuccess = output.length > 0;
            markAgentExited(agentSid, exitSuccess, output || undefined).catch(() => {});
            buildorEvents.emit(exitSuccess ? 'agent-completed' : 'agent-failed', { agentSessionId: agentSid, output }, agentSid);

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
      const data = event.data as { agentSessionId?: string; output?: string };
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
      // Refresh from backend, then inject result back to parent for implicit (native) agents
      listAgents().then((agents) => {
        const map = new Map<string, AgentPoolEntry>();
        for (const a of agents) map.set(a.sessionId, a);
        setPool(map);

        // Return-to-caller: inject result back to parent session
        // All agents with a parentSessionId return to caller (implicit contract)
        // When flows are added, flow-orchestrated agents will use a different routing mechanism
        if (data.agentSessionId) {
          const entry = map.get(data.agentSessionId);
          if (entry && entry.parentSessionId) {
            const output = data.output || '(No output captured)';
            const resultMessage = [
              `[AGENT RESULT — ${entry.name}]`,
              `Status: completed`,
              `Duration: ${entry.startedAt && entry.endedAt ? Math.round((new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000) + 's' : 'unknown'}`,
              '',
              output,
              '',
              `[END AGENT RESULT]`,
            ].join('\n');
            logEvent({
              sessionId: entry.parentSessionId,
              functionArea: 'claude-chat',
              level: 'info',
              operation: 'agent-result-inject',
              message: `Injecting result from agent "${entry.name}" (${data.agentSessionId}) into parent ${entry.parentSessionId}`,
              details: `Output length: ${output.length} chars`,
            }).catch(() => {});
            sendClaudeMessage(entry.parentSessionId, resultMessage).catch((err) => {
              logEvent({
                sessionId: entry.parentSessionId!,
                functionArea: 'claude-chat',
                level: 'error',
                operation: 'agent-result-inject',
                message: `Failed to inject result for "${entry.name}" into parent: ${err}`,
              }).catch(() => {});
            });
          }
        }
      }).catch(() => {});
    };

    const onFailed = (event: BuildorEvent) => {
      const data = event.data as { agentSessionId?: string; output?: string };
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

        // Return-to-caller: notify parent of failure
        if (data.agentSessionId) {
          const entry = map.get(data.agentSessionId);
          if (entry && entry.parentSessionId) {
            const output = data.output || '';
            const resultMessage = [
              `[AGENT FAILED — ${entry.name}]`,
              `Status: failed`,
              output ? `\nPartial output:\n${output}` : '(No output captured)',
              '',
              `[END AGENT RESULT]`,
            ].join('\n');
            logEvent({
              sessionId: entry.parentSessionId,
              functionArea: 'claude-chat',
              level: 'warn',
              operation: 'agent-result-inject',
              message: `Injecting failure notice from agent "${entry.name}" (${data.agentSessionId}) into parent ${entry.parentSessionId}`,
            }).catch(() => {});
            sendClaudeMessage(entry.parentSessionId, resultMessage).catch((err) => {
              logEvent({
                sessionId: entry.parentSessionId!,
                functionArea: 'claude-chat',
                level: 'error',
                operation: 'agent-result-inject',
                message: `Failed to inject failure notice for "${entry.name}" into parent: ${err}`,
              }).catch(() => {});
            });
          }
        }
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

  // Build hierarchical agent list, scoped to parentSessionId
  const { agents, completedAgents, activeCount } = useMemo(() => {
    const entries = Array.from(pool.values());

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
      }
    }

    // Collect top-level agents scoped to this session
    // If parentSessionId is provided, only show agents whose parentSessionId matches
    // (direct children of this session). Sub-agents appear as children of those.
    // If no parentSessionId, show all top-level agents (backward compat).
    const topLevel: AgentPoolAgent[] = [];
    for (const agent of agentMap.values()) {
      if (parentSessionId) {
        // Show agents directly spawned by this session (top-level for this view)
        if (agent.parentSessionId === parentSessionId) {
          topLevel.push(agent);
        }
      } else {
        // No session filter — show agents without a parent in the pool
        if (!agent.parentSessionId || !agentMap.has(agent.parentSessionId)) {
          topLevel.push(agent);
        }
      }
    }

    const active = topLevel.filter((a) => a.status === 'running');
    const completed = topLevel.filter((a) => a.status !== 'running');

    // Count all running agents in the scoped tree (including sub-agents)
    function countRunning(list: AgentPoolAgent[]): number {
      let n = 0;
      for (const a of list) {
        if (a.status === 'running') n++;
        n += countRunning(a.children);
      }
      return n;
    }

    return {
      agents: active,
      completedAgents: completed,
      activeCount: countRunning(topLevel),
    };
  }, [pool, statusLines, parentSessionId]);

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
