import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { invoke } from '@tauri-apps/api/core';
import { startClaudeSession, sendClaudeMessage, sendClaudeMessageWithImages, stopSession, interruptSession, setSessionModel, runClaudeCli } from '@/utils/commands/claude';
import { useImageAttachments } from './useImageAttachments';
import { ImagePreviewStrip } from './ImagePreviewStrip';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { buildSystemPrompt } from '@/utils/buildSystemPrompt';
import { logEvent } from '@/utils/commands/logging';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { ChatMessage, type ParsedMessage, type ChatContent } from './ChatMessage';
import { SlashCommandMenu, ModelPicker, getFilteredCommands, isBuiltinCommand, type SlashCommand } from './SlashCommandMenu';
import { ThinkingIndicator } from './ThinkingIndicator';
import { TaskTracker } from './TaskTracker';
import { useChatHistory } from './useChatHistory';
import { ChatHistory } from './ChatHistory';
import { buildAwareContext } from '@/utils/buildAwareContext';

export function ClaudeChat() {
  const { projectName, browsePath, browseBranch } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;
  const repoPath = browsePath || activeProject?.repoPath;

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dynamicCommands, setDynamicCommands] = useState<SlashCommand[]>([]);
  const [permissionQueue, setPermissionQueue] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false);
  const { images, addImageFromFile, removeImage, clearImages, getAttachments, hasImages } = useImageAttachments();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [awareSessions, setAwareSessions] = useState<Set<string>>(new Set());
  const branchLabel = browseBranch || activeProject?.currentBranch || 'main';
  const { startSession: startChatSession, endSession: endChatSession, saveMessage, saveUserMessage } = useChatHistory({
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
        if (parsed.isResult) {
          setIsSending(false);
          setTimeout(() => inputRef.current?.focus(), 50);
        }
        // Queue permission requests — only first unresolved one shows at a time
        const permBlock = parsed.content.find((c: ChatContent) => c.type === 'permission_request');
        if (permBlock && permBlock.requestId) {
          setPermissionQueue((q) => [...q, permBlock.requestId!]);
        }
        setMessages((prev) => [...prev, parsed]);
        saveMessage(parsed);
      }
    });

    const unlistenExit = listen<string>(`claude-exit-${sessionId}`, () => {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: '--- Session ended ---' }] }]);
      endChatSession();
      setSessionId(null);
      setIsSending(false);
    });

    // When a permission is resolved, remove it from queue so next one shows
    const onPermResolved = (event: BuildorEvent) => {
      if (event.sessionId === sessionId) {
        const data = event.data as { requestId?: string };
        if (data.requestId) {
          setPermissionQueue((q) => q.filter((id) => id !== data.requestId));
        }
      }
    };
    buildorEvents.on('permission-resolved', onPermResolved);

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      buildorEvents.off('permission-resolved', onPermResolved);
    };
  }, [sessionId, model]);

  const startClaude = async (dir: string, modelOverride?: string) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const systemPrompt = buildSystemPrompt();
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

  // Auto-start when component mounts with a valid path
  useEffect(() => {
    if (repoPath && !sessionId && !isStarting) {
      startClaude(repoPath);
    }
  }, [repoPath]);

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
    // Build user message content with optional image previews
    const userContent: ChatContent[] = [];
    if (hasImages) {
      for (const img of images) {
        userContent.push({ type: 'text', text: `[Image: ${img.name}]` });
      }
    }
    userContent.push({ type: 'text', text: msg });
    setMessages((prev) => [...prev, { role: 'user', content: userContent }]);
    saveUserMessage(userContent);
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

  if (!activeProject) {
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
          <span style={{ fontSize: 14, fontWeight: 600 }}>Claude Chat</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--border-primary)', padding: '1px 6px', borderRadius: 10 }}>
            {activeProject.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--accent-primary)', fontFamily: "'Cascadia Code', monospace" }}>
            {branchLabel}
          </span>
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
          {!sessionId && repoPath ? (
            <button onClick={() => startClaude(repoPath)} disabled={isStarting} style={{
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

      {/* Collapsible palette sidebar — inside the glow wrapper */}
      {paletteOpen ? (
        <div style={{
          width: 220,
          borderLeft: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <div
            onClick={() => setPaletteOpen(false)}
            style={{
              padding: '12px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid var(--border-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            Skills & Flows
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
          <div style={{
            padding: 16, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center',
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            Command palette coming soon
          </div>
        </div>
      ) : (
        <div
          onClick={() => setPaletteOpen(true)}
          style={{
            width: 28,
            borderLeft: '1px solid var(--border-primary)',
            background: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          Skills & Flows
        </div>
      )}

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
        isOpen={historyOpen}
        onToggleOpen={() => setHistoryOpen(!historyOpen)}
      />
      </div>{/* close glow wrapper */}
    </div>
  );
}
