import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { homeDir } from '@tauri-apps/api/path';
import { useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { invoke } from '@tauri-apps/api/core';
import { startClaudeSession, sendClaudeMessage, sendClaudeMessageWithImages, stopSession, interruptSession, setSessionModel, runClaudeCli, respondToPermission } from '@/utils/commands/claude';
import { useImageAttachments } from './useImageAttachments';
import { ImagePreviewStrip } from './ImagePreviewStrip';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { buildSystemPrompt, type ActiveSkillDescription } from '@/utils/buildSystemPrompt';
import { logEvent } from '@/utils/commands/logging';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { ChatMessage, type ParsedMessage, type ChatContent } from './ChatMessage';
import { SlashCommandMenu, ModelPicker, getFilteredCommands, isBuiltinCommand, type SlashCommand } from './SlashCommandMenu';
import { ThinkingIndicator } from './ThinkingIndicator';
import { CompactingIndicator } from './CompactingIndicator';
import { TaskTracker } from './TaskTracker';
import { useUsageStore } from '@/stores/usageStore';
import { useChatHistory } from './useChatHistory';
import { ChatHistory } from './ChatHistory';
import { SkillsPalette } from './SkillsPalette';
import { useSkills } from '@/hooks/useSkills';
import { buildAwareContext } from '@/utils/buildAwareContext';
import { processSkillPrompt } from '@/utils/skillProcessor';
import { translateNativeSkill } from '@/utils/nativeSkillTranslator';
import { readFileContent } from '@/utils/commands/filesystem';
import { getBuildorSkill } from '@/utils/commands/skills';
import type { ProjectSkill } from '@/types/skill';
import { useAgentPool } from '@/hooks/useAgentPool';
import { purgeResults } from '@/utils/commands/mailbox';
import { AgentStatusCard } from './AgentStatusCard';
import { AgentsPanel } from './AgentsPanel';
// AgentOutputBlock is rendered via ChatMessage for system-event messages

type ActivePanel = 'skills' | 'agents' | 'history' | null;

const BUILDOR_CHAT_SYSTEM_PROMPT = `You are chatting with the user through Buildor, a desktop companion for Claude Code. This is a general-purpose conversation — your areas of conversation can extend to any topic and are NOT scoped to any specific project or codebase.

You can help with:
- General programming questions and concepts
- Architecture and design discussions
- Learning and explanations on any topic
- Brainstorming and problem-solving
- Writing, research, and analysis

IMPORTANT: If the user asks questions about a specific codebase or wants you to read/modify code, suggest that they open a chat inside that project instead (using the Claude Chat project selector in Buildor's sidebar). This way Buildor can see the current code state and provide much better assistance.`;

export function ClaudeChat() {
  const { projectName, browsePath, browseBranch } = useTabContext();
  const { projects } = useProjectStore();
  const isBuildorChat = projectName === '__buildor__';
  const activeProject = isBuildorChat ? null : projects.find((p) => p.name === projectName) || null;
  const repoPath = isBuildorChat ? undefined : (browsePath || activeProject?.repoPath);
  const [buildorDir, setBuildorDir] = useState<string | null>(null);

  // Resolve home directory for Buildor chat mode
  useEffect(() => {
    if (isBuildorChat) {
      homeDir().then(setBuildorDir).catch(() => setBuildorDir(null));
    }
  }, [isBuildorChat]);

  const effectiveDir = isBuildorChat ? buildorDir : repoPath;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerbose, setIsVerbose] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [dynamicCommands, setDynamicCommands] = useState<SlashCommand[]>([]);
  const [permissionQueue, setPermissionQueue] = useState<string[]>([]);
  const [loadingForkSkill, setLoadingForkSkill] = useState<string | null>(null);
  const [autoAcceptTools, setAutoAcceptTools] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false);
  const replayingRef = useRef(false);
  const { images, addImageFromFile, removeImage, clearImages, getAttachments, hasImages } = useImageAttachments(sessionId || undefined);
  const [awareSessions, setAwareSessions] = useState<Set<string>>(new Set());
  const skills = useSkills({ repoPath, projectName: projectName || undefined });
  const agentPool = useAgentPool();
  const branchLabel = isBuildorChat ? '' : (browseBranch || activeProject?.currentBranch || 'main');
  const { startSession: startChatSession, endSession: endChatSession, saveMessage, saveUserMessage, saveSystemEvent } = useChatHistory({
    projectName: projectName || '',
    repoPath: repoPath || '',
    branchName: branchLabel,
  });
  // Glow is only for breakout windows — not used here

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  // Load dynamic commands (skills + custom commands) from .claude/ directory
  useEffect(() => {
    if (!repoPath) return;
    invoke<{ name: string; description: string; source: string }[]>('list_claude_commands', { repoPath })
      .then((cmds) => {
        setDynamicCommands(cmds.map((c) => ({
          name: c.name,
          description: c.description,
          source: c.source as 'skill' | 'command',
        })));
      })
      .catch(() => setDynamicCommands([]));
  }, [repoPath]);

  // Listen to events
  useEffect(() => {
    if (!sessionId) return;

    const unlistenOutput = listen<string>(`claude-output-${sessionId}`, (event) => {
      const parsed = parseStreamEvent(event.payload, sessionId);
      if (parsed) {
        if (parsed.model && !model) setModel(parsed.model);

        // During replay, suppress all output — don't show replayed responses in UI
        if (replayingRef.current) {
          // Still track result events to know when each replay turn finishes
          if (parsed.isResult) {
            // Replay turn completed — the replay loop handles sequencing
          }
          return;
        }

        if (parsed.isResult) {
          setIsSending(false);
          setAutoAcceptTools([]); // Clear auto-accept after turn completes
          setTimeout(() => inputRef.current?.focus(), 50);
        }
        // Queue permission requests — auto-accept if tool is in allowedTools, otherwise show UI
        const permBlock = parsed.content.find((c: ChatContent) => c.type === 'permission_request');
        if (permBlock && permBlock.requestId) {
          const toolName = permBlock.name || '';
          if (autoAcceptTools.length > 0 && autoAcceptTools.includes(toolName)) {
            // Auto-accept: respond immediately, don't show permission card
            respondToPermission(sessionId, permBlock.requestId, true).catch(() => {});
            buildorEvents.emit('permission-resolved', { requestId: permBlock.requestId, autoAccepted: true, toolName }, sessionId);
            // Skip adding this message to the UI
          } else {
            setPermissionQueue((q) => [...q, permBlock.requestId!]);
            setMessages((prev) => [...prev, parsed]);
          }
        } else {
          setMessages((prev) => [...prev, parsed]);
        }
        saveMessage(parsed);
      }
    });

    const unlistenExit = listen<string>(`claude-exit-${sessionId}`, () => {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: '--- Session ended ---' }] }]);
      endChatSession();
      // Purge agent mailbox results for this parent session
      purgeResults(sessionId!).catch(() => {});
      setSessionId(null);
      setIsSending(false);
    });

    // When a permission is resolved, remove it from queue so next one shows
    const onPermResolved = (event: BuildorEvent) => {
      // Accept resolutions from any session (main or agent)
      const data = event.data as { requestId?: string };
      if (data.requestId) {
        setPermissionQueue((q) => q.filter((id) => id !== data.requestId));
      }
    };
    buildorEvents.on('permission-resolved', onPermResolved);

    // Agent permissions: surface in main chat with agent name badge
    const onAgentPermission = (event: BuildorEvent) => {
      const data = event.data as {
        agentSessionId?: string;
        agentName?: string;
        requestId?: string;
        toolName?: string;
        description?: string;
      };
      if (data.requestId && data.agentSessionId) {
        setPermissionQueue((q) => [...q, data.requestId!]);
        setMessages((prev) => [...prev, {
          role: 'tool' as const,
          content: [{
            type: 'permission_request' as const,
            name: `Agent: ${data.agentName || 'Agent'} → ${data.toolName || 'Unknown'}`,
            text: data.description || '',
            requestId: data.requestId,
            toolUseId: '',
            agentSessionId: data.agentSessionId,
          }],
        }]);
      }
    };
    buildorEvents.on('agent-permission', onAgentPermission);

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      buildorEvents.off('permission-resolved', onPermResolved);
      buildorEvents.off('agent-permission', onAgentPermission);
    };
  }, [sessionId, model, autoAcceptTools]);

  // Auto-compact: when context hits 95%, send /compact proactively
  useEffect(() => {
    if (!sessionId) return;

    const onCompactNeeded = (event: BuildorEvent) => {
      if (event.sessionId !== sessionId) return;
      // Mark compacting in store, then send /compact
      useUsageStore.getState().markCompacting(sessionId);
      const preTokens = useUsageStore.getState().sessions[sessionId]?.preCompactTokens || 0;
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: `Context at 95% — auto-compacting...` }],
      }]);
      saveSystemEvent('compact-triggered', { preCompactTokens: preTokens, timestamp: new Date().toISOString() });
      logEvent({
        repo: repoPath || '',
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'auto-compact',
        message: `Auto-compact triggered at ${preTokens} tokens`,
        sessionId,
      }).catch(() => {});
      sendClaudeMessage(sessionId, '/compact').catch(() => {});
    };

    const onCompactDone = (event: BuildorEvent) => {
      if (event.sessionId !== sessionId) return;
      const data = event.data as { preCompactTokens: number; postCompactTokens: number };
      useUsageStore.getState().markCompactDone(sessionId);

      // End current chat history session, start a new one
      endChatSession();

      // Clear messages and show a fresh start with context reference
      const preK = data.preCompactTokens >= 1000 ? `${(data.preCompactTokens / 1000).toFixed(0)}k` : String(data.preCompactTokens);
      const postK = data.postCompactTokens >= 1000 ? `${(data.postCompactTokens / 1000).toFixed(0)}k` : String(data.postCompactTokens);
      setMessages([{
        role: 'system',
        content: [{ type: 'text', text: `Context compacted (${preK} → ${postK} tokens). Previous messages summarized by Claude. Conversation continues.` }],
      }]);
      setIsSending(false);
      buildorEvents.emit('tasks-updated', { action: 'clear' }, sessionId);

      // Start a new chat history session for post-compact messages
      startChatSession(sessionId);
      saveSystemEvent('compact-completed', {
        preCompactTokens: data.preCompactTokens,
        postCompactTokens: data.postCompactTokens,
        timestamp: new Date().toISOString(),
      });

      logEvent({
        repo: repoPath || '',
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'compact-complete',
        message: `Compaction done: ${preK} → ${postK} tokens`,
        sessionId,
      }).catch(() => {});
    };

    buildorEvents.on('compact-started', onCompactNeeded);
    buildorEvents.on('compact-completed', onCompactDone);
    return () => {
      buildorEvents.off('compact-started', onCompactNeeded);
      buildorEvents.off('compact-completed', onCompactDone);
    };
  }, [sessionId, repoPath]);

  // Agent health monitoring: show notification when a top-level agent becomes distressed
  useEffect(() => {
    const onHealthChanged = (event: BuildorEvent) => {
      const data = event.data as {
        agentSessionId?: string;
        agentName?: string;
        previousState?: string;
        newState?: string;
        parentSessionId?: string | null;
        details?: string;
      };
      // Only surface distressed top-level agents (no parent) as chat notifications
      if (data.newState === 'distressed' && !data.parentSessionId) {
        setMessages((prev) => [...prev, {
          role: 'system',
          content: [{ type: 'text', text: `⚠ Agent "${data.agentName}" is distressed: ${data.details || 'health check failed'}. Check the Agents panel.` }],
        }]);
      }
    };
    buildorEvents.on('agent-health-changed', onHealthChanged);
    return () => {
      buildorEvents.off('agent-health-changed', onHealthChanged);
    };
  }, []);

  // Agent completed: inject AgentOutputBlock into chat messages
  useEffect(() => {
    const onAgentCompleted = (event: BuildorEvent) => {
      const data = event.data as {
        agentSessionId?: string;
        agentName?: string;
        resultSummary?: string;
        durationMs?: number;
      };
      if (data.agentName) {
        // Save system-event marker for history
        saveSystemEvent('agent-completed', {
          agentName: data.agentName,
          agentSessionId: data.agentSessionId,
          durationMs: data.durationMs,
          timestamp: new Date().toISOString(),
        });
        // Inject output block as a special message
        setMessages((prev) => [...prev, {
          role: 'system-event' as const,
          content: [{ type: 'text', text: JSON.stringify({
            event_type: 'agent-completed',
            agentName: data.agentName,
            resultSummary: data.resultSummary || '',
            durationMs: data.durationMs,
          }) }],
        }]);
      }
    };

    const onAgentFailed = (event: BuildorEvent) => {
      const data = event.data as {
        agentSessionId?: string;
        agentName?: string;
        details?: string;
      };
      if (data.agentName) {
        saveSystemEvent('agent-failed', {
          agentName: data.agentName,
          agentSessionId: data.agentSessionId,
          details: data.details,
          timestamp: new Date().toISOString(),
        });
        setMessages((prev) => [...prev, {
          role: 'system-event' as const,
          content: [{ type: 'text', text: JSON.stringify({
            event_type: 'agent-failed',
            agentName: data.agentName,
            details: data.details || 'Unknown error',
          }) }],
        }]);
      }
    };

    const onAgentSpawned = (event: BuildorEvent) => {
      const data = event.data as {
        marker?: { name?: string };
        parentSessionId?: string;
      };
      const name = data.marker?.name;
      if (name) {
        saveSystemEvent('agent-started', {
          agentName: name,
          parentSessionId: data.parentSessionId,
          timestamp: new Date().toISOString(),
        });
        setMessages((prev) => [...prev, {
          role: 'system-event' as const,
          content: [{ type: 'text', text: JSON.stringify({
            event_type: 'agent-started',
            agentName: name,
          }) }],
        }]);
      }
    };

    buildorEvents.on('agent-completed', onAgentCompleted);
    buildorEvents.on('agent-failed', onAgentFailed);
    buildorEvents.on('agent-spawned', onAgentSpawned);
    return () => {
      buildorEvents.off('agent-completed', onAgentCompleted);
      buildorEvents.off('agent-failed', onAgentFailed);
      buildorEvents.off('agent-spawned', onAgentSpawned);
    };
  }, [saveSystemEvent]);

  const startClaude = async (dir: string, modelOverride?: string, activeSkills?: ActiveSkillDescription[]) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const systemPrompt = isBuildorChat
        ? buildSystemPrompt(BUILDOR_CHAT_SYSTEM_PROMPT)
        : activeSkills && activeSkills.length > 0
          ? buildSystemPrompt({ activeSkills })
          : buildSystemPrompt();
      const { sessionId: sid, pid } = await startClaudeSession(dir, modelOverride || selectedModel, systemPrompt);
      setSessionId(sid);
      startChatSession(sid);
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Claude ready.' }] }]);
      logEvent({
        repo: dir,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-start',
        message: `Claude session started: ${sid} (PID: ${pid ?? 'unknown'})`,
      }).catch(() => {});
      inputRef.current?.focus();
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Failed: ${String(e)}` }] }]);
    }
    setIsStarting(false);
    startingRef.current = false;
  };

  // Auto-start when component mounts with a valid path (include persisted eyeball skills)
  useEffect(() => {
    if (effectiveDir && !sessionId && !isStarting) {
      startClaude(effectiveDir, undefined, skills.activeSkillDescriptions.length > 0 ? skills.activeSkillDescriptions : undefined);
    }
  }, [effectiveDir]);

  const handleSlashCommand = useCallback(async (command: string, fullMessage?: string) => {
    setInput('');
    setShowSlashMenu(false);

    if (command === '/model') { setShowModelPicker(true); return; }
    if (command === '/login') {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Opening login...' }] }]);
      try {
        const result = await runClaudeCli(['login']);
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: result || 'Login complete.' }] }]);
      } catch (e) {
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Login failed: ${String(e)}` }] }]);
      }
      return;
    }
    if (command === '/logout') {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Logging out...' }] }]);
      try {
        const result = await runClaudeCli(['logout']);
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: result || 'Logged out.' }] }]);
      } catch (e) {
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Logout failed: ${String(e)}` }] }]);
      }
      return;
    }
    if (command === '/clear') {
      endChatSession();
      if (sessionId) await stopSession(sessionId);
      setMessages([]);
      setSessionId(null);
      setIsSending(false);
      setModel(null);
      buildorEvents.emit('tasks-updated', { action: 'clear' }, sessionId || undefined);
      if (repoPath) {
        setMessages([{ role: 'system', content: [{ type: 'text', text: 'Chat cleared. Restarting...' }] }]);
        startClaude(repoPath);
      }
      return;
    }
    if (command === '/cost') {
      const costs = messages.filter((m) => m.costUsd && m.costUsd > 0);
      const total = costs.reduce((sum, m) => sum + (m.costUsd || 0), 0);
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Total cost: $${total.toFixed(4)} across ${costs.length} turn(s)` }] }]);
      return;
    }
    if (command === '/help') {
      const dynamicList = dynamicCommands.map((c) => `${c.name} — ${c.description || c.source}`).join('\n');
      const helpText = 'Commands:\n/model — Switch AI model\n/login — Sign in\n/logout — Sign out\n/clear — Clear & restart\n/cost — Show cost\n/help — This list'
        + (dynamicList ? `\n\nSkills & Custom Commands:\n${dynamicList}` : '');
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: helpText }] }]);
      return;
    }

    // Non-builtin command — scan .claude/ first, then decide
    if (!isBuiltinCommand(command)) {
      if (!repoPath) return;
      const msgToSend = fullMessage || command;
      try {
        await invoke('resolve_claude_command', {
          repoPath,
          commandName: command,
        });
        // Found — send full message (command + args) to Claude
        if (sessionId) {
          setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: msgToSend }] }]);
          setIsSending(true);
          await sendClaudeMessage(sessionId, msgToSend);
        }
      } catch {
        // Not found in .claude/ — show error
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Unknown command: ${command}\nType /help to see available commands.` }] }]);
      }
      return;
    }
  }, [sessionId, repoPath, messages, selectedModel, dynamicCommands]);

  const handleModelSelect = useCallback(async (modelId: string) => {
    setShowModelPicker(false);
    setSelectedModel(modelId);
    const modelLabel = modelId.replace('claude-', '').replace(/-/g, ' ');

    if (sessionId) {
      // Use set_model control message — preserves session, context, and prompt cache
      try {
        await setSessionModel(sessionId, modelId);
        setModel(modelId);
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Switched to ${modelLabel}` }] }]);
      } catch {
        // Fallback: if set_model not supported, just notify
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Failed to switch model. Use /clear to restart with ${modelLabel}.` }] }]);
      }
    }
  }, [sessionId]);

  const handleSend = useCallback(async () => {
    if (!sessionId || (!input.trim() && !hasImages) || isSending) return;
    const msg = input.trim();
    if (msg.startsWith('/')) {
      const cmdName = msg.split(' ')[0].toLowerCase();
      const hasArgs = msg.includes(' ');
      if (!hasArgs) {
        // Pure slash command (no args)
        handleSlashCommand(cmdName);
        return;
      }
      // Slash command with args
      if (isBuiltinCommand(cmdName) || dynamicCommands.some((c) => c.name === cmdName)) {
        handleSlashCommand(cmdName, msg);
        return;
      }
      // Unknown /command with args — scan before sending
      if (repoPath) {
        setInput('');
        handleSlashCommand(cmdName, msg);
        return;
      }
    }
    setInput('');
    setIsSending(true);
    // Build user message content with optional image thumbnails
    const userContent: ChatContent[] = [];
    if (hasImages) {
      for (const img of images) {
        userContent.push({ type: 'image', text: img.name, imageDataUrl: img.preview, imagePath: img.filePath });
      }
    }
    userContent.push({ type: 'text', text: msg });
    setMessages((prev) => [...prev, { role: 'user', content: userContent }]);
    // Persist with file path but strip the data URL to avoid bloating the DB
    const persistContent = userContent.map((c) =>
      c.type === 'image' ? { type: 'image' as const, text: c.text, imagePath: c.imagePath } : c
    );
    saveUserMessage(persistContent);
    try {
      // Build aware context prefix if any sessions are selected
      let messageToSend = msg;
      if (awareSessions.size > 0 && !hasImages) {
        const awareCtx = await buildAwareContext(
          Array.from(awareSessions),
          projectName || '',
        ).catch(() => '');
        if (awareCtx) messageToSend = awareCtx + msg;
      }

      if (hasImages) {
        const attachments = getAttachments();
        clearImages();
        await sendClaudeMessageWithImages(sessionId, msg, attachments);
      } else {
        await sendClaudeMessage(sessionId, messageToSend);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Error: ${String(e)}` }] }]);
      setIsSending(false);
    }
    inputRef.current?.focus();
  }, [sessionId, input, isSending, hasImages, images, getAttachments, clearImages, handleSlashCommand, awareSessions, projectName]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    // Send interrupt control message — session stays alive, context preserved
    try {
      await interruptSession(sessionId);
    } catch {
      // If interrupt fails, the session may have already exited
    }
    setIsSending(false);
  }, [sessionId]);

  const togglePanel = useCallback((panel: ActivePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handlePrefillInput = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, []);

  const handleTranslateAndSpawn = useCallback(async (skill: ProjectSkill) => {
    if (loadingForkSkill) return; // prevent duplicate clicks during translation
    setLoadingForkSkill(skill.name);
    try {
      // Read the SKILL.md content
      const skillMdPaths = [
        `${skill.skillDir}/${skill.name}.md`,
        `${skill.skillDir}/SKILL.md`,
      ];
      let skillMdContent = '';
      for (const path of skillMdPaths) {
        try {
          skillMdContent = await readFileContent(path.replace(/\//g, '\\'));
          if (skillMdContent) break;
        } catch { /* try next path */ }
      }

      if (!skillMdContent) {
        setMessages((prev) => [...prev, {
          role: 'system',
          content: [{ type: 'text', text: `Could not read skill file for "${skill.name}"` }],
        }]);
        return;
      }

      // Translate to BuildorSkill format (in memory only)
      const translated = translateNativeSkill(skill, skillMdContent);

      // Process the prompt (param substitution, shell blocks, etc.)
      const processedPrompt = await processSkillPrompt(translated, {});

      // For fork skills, agent spawning is Phase 5.
      // For now, inject the processed prompt into the active session.
      if (sessionId) {
        setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: processedPrompt }] }]);
        saveUserMessage([{ type: 'text', text: processedPrompt }]);
        saveSystemEvent('skill-run', { skillName: skill.name, skillSource: 'project', isFork: true, timestamp: new Date().toISOString() });
        buildorEvents.emit('skill-invoked', { skillName: skill.name, skillSource: 'project', isFork: true }, sessionId);
        setIsSending(true);
        await sendClaudeMessage(sessionId, processedPrompt);
      }
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: `Skill translation failed: ${String(e)}` }],
      }]);
    } finally {
      setLoadingForkSkill(null);
    }
  }, [sessionId, loadingForkSkill, saveUserMessage, saveSystemEvent]);

  const handleInvokeSkill = useCallback(async (name: string, params: Record<string, string | number | boolean>) => {
    if (!sessionId) return;
    try {
      // Fetch the full skill data
      const skill = await getBuildorSkill(name);

      // Handle model override if skill specifies one
      if (skill.execution?.model && skill.execution.model !== model) {
        try {
          await setSessionModel(sessionId, skill.execution.model);
          setModel(skill.execution.model);
        } catch { /* model switch failed, continue with current model */ }
      }

      // Process the prompt
      const processedPrompt = await processSkillPrompt(skill, params);

      // Save skill-run marker to chat history
      saveSystemEvent('skill-run', {
        skillName: name,
        skillSource: 'buildor',
        params: Object.keys(params).length > 0 ? params : undefined,
        timestamp: new Date().toISOString(),
      });

      // Inject as user message
      setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: processedPrompt }] }]);
      saveUserMessage([{ type: 'text', text: processedPrompt }]);
      buildorEvents.emit('skill-invoked', { skillName: name, skillSource: 'buildor', params }, sessionId);

      // Store allowed tools for auto-accept logic
      if (skill.execution?.allowedTools && skill.execution.allowedTools.length > 0) {
        setAutoAcceptTools(skill.execution.allowedTools);
      }

      setIsSending(true);
      await sendClaudeMessage(sessionId, processedPrompt);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: `Skill "${name}" failed: ${String(e)}` }],
      }]);
    }
  }, [sessionId, model, saveUserMessage, saveSystemEvent]);

  const handleToggleEyeball = useCallback(async (skillName: string) => {
    if (!effectiveDir) return;

    // 1. Toggle the eyeball state in the hook
    const wasActive = skills.activeEyeballs.has(skillName);
    skills.toggleEyeball(skillName);

    // Compute what the new active set will be after toggle
    const newEyeballs = new Set(skills.activeEyeballs);
    if (wasActive) newEyeballs.delete(skillName);
    else newEyeballs.add(skillName);

    // Resolve descriptions for all active skills
    const newActiveSkills: ActiveSkillDescription[] = skills.buildorSkills
      .filter((s) => newEyeballs.has(s.name))
      .map((s) => ({ name: s.name, description: s.description, skillDir: s.skillDir }));

    // 2. Save system event marker
    const eventType = wasActive ? 'skill-deactivated' : 'skill-activated';
    const matchedSkill = skills.buildorSkills.find((s) => s.name === skillName);
    saveSystemEvent(eventType, {
      skillName,
      skillDescription: matchedSkill?.description || '',
      skillSource: 'buildor',
      timestamp: new Date().toISOString(),
    });

    // Emit event
    buildorEvents.emit(
      wasActive ? 'skill-deactivated' : 'skill-activated',
      {
        skillName,
        skillDescription: matchedSkill?.description || '',
        skillSource: 'buildor',
      },
      sessionId || undefined,
    );

    // 3. Collect current user messages before restarting
    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => {
        const textBlock = m.content.find((c) => c.type === 'text');
        return textBlock?.text || '';
      })
      .filter((t) => t.length > 0);

    // 4. Show restart indicator
    setMessages((prev) => [...prev, {
      role: 'system',
      content: [{ type: 'text', text: wasActive
        ? `Skill deactivated: ${skillName}. Restarting session...`
        : `Skill activated: ${skillName}. Restarting session...`
      }],
    }]);

    // 5. Interrupt and stop current session
    if (sessionId) {
      try { await interruptSession(sessionId); } catch { /* may have already exited */ }
      try { await stopSession(sessionId); } catch { /* may have already exited */ }
    }

    // Don't end chat session — we want to keep the same session ID in history
    setSessionId(null);
    setIsSending(false);

    // 6. Start new session with updated system prompt
    startingRef.current = false; // Reset so startClaude can proceed
    setIsStarting(false);

    // Start fresh with skill descriptions in system prompt
    try {
      const systemPrompt = isBuildorChat
        ? buildSystemPrompt(BUILDOR_CHAT_SYSTEM_PROMPT)
        : newActiveSkills.length > 0
          ? buildSystemPrompt({ activeSkills: newActiveSkills })
          : buildSystemPrompt();
      const { sessionId: newSid } = await startClaudeSession(effectiveDir, selectedModel, systemPrompt);
      setSessionId(newSid);

      // Map the new session to the existing chat history session (keep continuity)
      startChatSession(newSid);

      logEvent({
        repo: effectiveDir,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'eyeball-restart',
        message: `Silent restart for skill ${wasActive ? 'deactivation' : 'activation'}: ${skillName}. Active skills: ${[...newEyeballs].join(', ') || 'none'}`,
        sessionId: newSid,
      }).catch(() => {});

      // 7. Replay user messages silently
      if (userMessages.length > 0) {
        replayingRef.current = true;
        setMessages((prev) => [...prev, {
          role: 'system',
          content: [{ type: 'text', text: `Replaying ${userMessages.length} message(s)...` }],
        }]);

        for (const msg of userMessages) {
          // Send each message and wait for the turn to complete before sending the next
          await sendClaudeMessage(newSid, msg);
          // Wait for the result event that signals turn completion
          await buildorEvents.once('turn-completed');
        }

        replayingRef.current = false;
      }

      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: 'Session restarted. Conversation continues.' }],
      }]);
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      replayingRef.current = false;
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: `Restart failed: ${String(e)}` }],
      }]);
    }
  }, [effectiveDir, sessionId, messages, skills, isBuildorChat, selectedModel, saveSystemEvent, startChatSession]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowSlashMenu(true);
      setSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
    setShowModelPicker(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommands(input, dynamicCommands);
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i > 0 ? i - 1 : filtered.length - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i < filtered.length - 1 ? i + 1 : 0)); return; }
      if (e.key === 'Tab' && filtered[slashIndex]) {
        e.preventDefault();
        setInput(filtered[slashIndex].name + ' ');
        setShowSlashMenu(false);
        return;
      }
      if (e.key === 'Enter' && filtered.length > 0 && filtered[slashIndex]) { e.preventDefault(); handleSlashCommand(filtered[slashIndex].name); return; }
      if (e.key === 'Escape') { setShowSlashMenu(false); return; }
    }
    if (showModelPicker && e.key === 'Escape') { setShowModelPicker(false); return; }
    // Escape interrupts while Claude is thinking — auto-restarts session
    if (e.key === 'Escape' && isSending && sessionId) {
      e.preventDefault();
      handleStop();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!activeProject && !isBuildorChat) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        Select a project to start a Claude session
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header — above the glow */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isBuildorChat ? 'Chat with Buildor' : 'Claude Chat'}</span>
          {!isBuildorChat && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--border-primary)', padding: '1px 6px', borderRadius: 10 }}>
                {activeProject!.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--accent-primary)', fontFamily: "'Cascadia Code', monospace" }}>
                {branchLabel}
              </span>
            </>
          )}
          {isBuildorChat && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              General conversation
            </span>
          )}
          {sessionId && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />}
          {model && <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--border-primary)', padding: '1px 6px', borderRadius: 8 }}>{model}</span>}
          {isSending && <span style={{ fontSize: 11, color: '#d29922', fontStyle: 'italic' }}>thinking...</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setIsVerbose(!isVerbose)} style={{
            background: isVerbose ? 'var(--bg-active)' : 'var(--border-primary)',
            border: `1px solid ${isVerbose ? 'var(--accent-secondary)' : 'var(--border-secondary)'}`,
            color: isVerbose ? 'var(--accent-primary)' : 'var(--text-secondary)',
            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          }}>
            {isVerbose ? 'Verbose' : 'Conversation'}
          </button>
          {!sessionId && effectiveDir ? (
            <button onClick={() => startClaude(effectiveDir)} disabled={isStarting} style={{
              background: '#238636', border: 'none', color: '#fff', borderRadius: 6,
              padding: '4px 14px', fontSize: 13, fontWeight: 600,
              cursor: isStarting ? 'default' : 'pointer', opacity: isStarting ? 0.6 : 1,
            }}>
              {isStarting ? 'Starting...' : 'Restart'}
            </button>
          ) : sessionId ? (
            <button onClick={handleStop} style={{
              background: 'var(--border-primary)', border: '1px solid #da3633', color: '#f85149',
              borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer',
            }}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {/* Body — messages + palette + input */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Messages */}
        <div ref={outputRef} style={{ flex: 1, overflow: 'auto', background: 'var(--bg-inset)' }}>
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} isVerbose={isVerbose} sessionId={sessionId || undefined} activePermissionId={permissionQueue[0] || null} />
          ))}
        </div>

        {/* Sticky task tracker — always mounted to preserve state across session restarts */}
        <TaskTracker sessionId={sessionId || undefined} />

        {/* Agent status card — shows active agents above input */}
        <AgentStatusCard agents={agentPool.agents} onOpenPanel={() => setActivePanel('agents')} />

        {/* Compacting indicator — shown while /compact is in progress */}
        {sessionId && <CompactingIndicator sessionId={sessionId} />}

        {/* Thinking animation */}
        {isSending && sessionId && <ThinkingIndicator sessionId={sessionId} />}

        {/* Input */}
        {sessionId && (
          <div
            ref={inputAreaRef}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = e.dataTransfer?.files;
              if (files) {
                for (const file of Array.from(files)) {
                  if (file.type.startsWith('image/')) await addImageFromFile(file);
                }
              }
            }}
            style={{
              borderTop: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              flexShrink: 0, position: 'relative',
            }}
          >
            <ImagePreviewStrip images={images} onRemove={removeImage} />
            <div style={{ padding: 8, display: 'flex', gap: 6 }}>
            {showSlashMenu && <SlashCommandMenu filter={input} onSelect={handleSlashCommand} onClose={() => setShowSlashMenu(false)} selectedIndex={slashIndex} dynamicCommands={dynamicCommands} />}
            {showModelPicker && <ModelPicker currentModel={model} onSelect={handleModelSelect} onClose={() => setShowModelPicker(false)} />}
            <input
              ref={inputRef} type="text" value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of Array.from(items)) {
                  if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) await addImageFromFile(file);
                    return;
                  }
                }
              }}
              placeholder={isSending ? 'Claude is thinking...' : hasImages ? 'Add a message about the image(s)...' : 'Type a message or / for commands...'}
              disabled={isSending}
              style={{
                flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 6,
                color: 'var(--text-primary)', padding: '8px 12px', fontSize: 13, outline: 'none',
                fontFamily: "'Cascadia Code', 'Consolas', monospace", opacity: isSending ? 0.6 : 1,
              }}
            />
            {isSending ? (
              <button onClick={handleStop} style={{
                background: '#d29922', border: 'none', color: '#fff',
                borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }} title="Interrupt (Esc)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="4" width="4" height="16" rx="1" fill="#fff" />
                  <rect x="15" y="4" width="4" height="16" rx="1" fill="#fff" />
                </svg>
                Pause
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim() && !hasImages} style={{
                background: (input.trim() || hasImages) ? '#238636' : 'var(--border-primary)',
                border: 'none', color: (input.trim() || hasImages) ? '#fff' : 'var(--text-tertiary)',
                borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                cursor: (input.trim() || hasImages) ? 'pointer' : 'default',
              }}>
                Send
              </button>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Right-side panels — only one open at a time */}
      <SkillsPalette
        buildorSkills={skills.filteredBuildorSkills}
        projectSkills={skills.filteredProjectSkills}
        activeEyeballs={skills.activeEyeballs}
        searchQuery={skills.searchQuery}
        onSearch={skills.search}
        onToggleEyeball={handleToggleEyeball}
        onPrefillInput={handlePrefillInput}
        onTranslateAndSpawn={handleTranslateAndSpawn}
        onInvokeSkill={handleInvokeSkill}
        isOpen={activePanel === 'skills'}
        onToggleOpen={() => togglePanel('skills')}
        loading={skills.loading}
        loadingForkSkill={loadingForkSkill}
      />

      {/* Agents panel */}
      <AgentsPanel
        agents={agentPool.agents}
        completedAgents={agentPool.completedAgents}
        activeCount={agentPool.activeCount}
        expandedAgentId={agentPool.expandedAgentId}
        onExpandAgent={agentPool.expandAgent}
        onGetMessages={agentPool.getAgentMessages}
        isOpen={activePanel === 'agents'}
        onToggleOpen={() => togglePanel('agents')}
      />

      {/* History sidebar */}
      <ChatHistory
        projectName={projectName || ''}
        currentSessionId={sessionId}
        awareSessions={awareSessions}
        onToggleAware={(id) =>
          setAwareSessions((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        isOpen={activePanel === 'history'}
        onToggleOpen={() => togglePanel('history')}
      />
      </div>{/* close glow wrapper */}
    </div>
  );
}
