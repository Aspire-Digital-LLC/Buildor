import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { startClaudeSession, sendClaudeMessage, stopSession, runClaudeCli } from '@/utils/commands/claude';
import { logEvent } from '@/utils/commands/logging';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { ChatMessage, type ParsedMessage } from '@/components/claude-chat/ChatMessage';
import { SlashCommandMenu, ModelPicker, getFilteredCommands } from '@/components/claude-chat/SlashCommandMenu';

export function ClaudeChatWindow() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerbose, setIsVerbose] = useState(false);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [windowTitle, setWindowTitle] = useState('Claude Chat');
  const [model, setModel] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  // Find worktree path from session
  useEffect(() => {
    const findWorktreePath = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        const t = await appWindow.title();
        setWindowTitle(t);

        const { listSessions } = await import('@/utils/commands/worktree');
        const sessions = await listSessions();
        const label = appWindow.label;
        const idPrefix = label.replace('claude-', '');
        const session = sessions.find((s) => s.sessionId.startsWith(idPrefix));
        if (session) {
          setWorkingDir(session.worktreePath);
          setMessages([{
            role: 'system',
            content: [{ type: 'text', text: `Session: ${session.branchName}\nWorktree: ${session.worktreePath}` }],
          }]);
          startClaude(session.worktreePath);
        } else {
          setMessages([{ role: 'system', content: [{ type: 'text', text: 'Could not find session.' }] }]);
        }
      } catch (e) {
        setMessages([{ role: 'system', content: [{ type: 'text', text: `Error: ${String(e)}` }] }]);
      }
    };
    findWorktreePath();
  }, []);

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
        setMessages((prev) => [...prev, parsed]);
      }
    });

    const unlistenExit = listen<string>(`claude-exit-${sessionId}`, () => {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: '--- Session ended ---' }] }]);
      setSessionId(null);
      setIsSending(false);
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
    };
  }, [sessionId, model]);

  const startClaude = async (dir: string, modelOverride?: string) => {
    setIsStarting(true);
    try {
      const sid = await startClaudeSession(dir, modelOverride || selectedModel);
      setSessionId(sid);
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Claude ready.` }] }]);
      logEvent({
        repo: dir,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-start',
        message: `Claude session started: ${sid}${modelOverride ? ` (model: ${modelOverride})` : ''}`,
      }).catch(() => {});
      inputRef.current?.focus();
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Failed: ${String(e)}` }] }]);
    }
    setIsStarting(false);
  };

  // Handle slash commands
  const handleSlashCommand = useCallback(async (command: string) => {
    setInput('');
    setShowSlashMenu(false);

    if (command === '/model') {
      setShowModelPicker(true);
      return;
    }

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
      if (sessionId) {
        await stopSession(sessionId);
      }
      setMessages([]);
      setSessionId(null);
      setIsSending(false);
      setModel(null);
      if (workingDir) {
        setMessages([{ role: 'system', content: [{ type: 'text', text: 'Chat cleared. Restarting...' }] }]);
        startClaude(workingDir);
      }
      return;
    }

    if (command === '/cost') {
      // Collect cost info from messages
      const costs = messages.filter((m) => m.costUsd && m.costUsd > 0);
      const total = costs.reduce((sum, m) => sum + (m.costUsd || 0), 0);
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: `Total cost this session: $${total.toFixed(4)} across ${costs.length} turn(s)` }],
      }]);
      return;
    }

    if (command === '/help') {
      setMessages((prev) => [...prev, {
        role: 'system',
        content: [{ type: 'text', text: 'Available commands:\n/model — Switch AI model\n/login — Sign in to Anthropic\n/logout — Sign out\n/clear — Clear chat and restart\n/cost — Show session cost\n/help — Show this list' }],
      }]);
      return;
    }
  }, [sessionId, workingDir, messages, selectedModel]);

  const handleModelSelect = useCallback(async (modelId: string) => {
    setShowModelPicker(false);
    setSelectedModel(modelId);
    const modelLabel = modelId.replace('claude-', '').replace(/-/g, ' ');

    // Collect conversation history to replay into new session
    const conversationHistory = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content.some((c) => c.type === 'text' && c.text)))
      .map((m) => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const text = m.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        return `${role}: ${text}`;
      })
      .join('\n\n');

    setMessages((prev) => [...prev, {
      role: 'system',
      content: [{ type: 'text', text: `Switching model to ${modelLabel}. Restarting session...` }],
    }]);

    // Stop current session and restart with new model
    if (sessionId) {
      await stopSession(sessionId);
      setSessionId(null);
    }
    setModel(null);
    if (workingDir) {
      setIsStarting(true);
      try {
        const sid = await startClaudeSession(workingDir, modelId);
        setSessionId(sid);
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Claude ready.' }] }]);

        // Replay conversation context if there was prior history
        if (conversationHistory.trim()) {
          const contextMsg = `[Context from previous model session - continue this conversation naturally]\n\n${conversationHistory}\n\n[You are now on model ${modelId}. Continue from where the conversation left off.]`;
          await sendClaudeMessage(sid, contextMsg);
          setIsSending(true);
        }

        logEvent({
          repo: workingDir,
          functionArea: 'claude-chat',
          level: 'info',
          operation: 'model-switch',
          message: `Switched to ${modelId}`,
        }).catch(() => {});
        inputRef.current?.focus();
      } catch (e) {
        setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Failed: ${String(e)}` }] }]);
      }
      setIsStarting(false);
    }
  }, [sessionId, workingDir, messages]);

  const handleSend = useCallback(async () => {
    if (!sessionId || !input.trim() || isSending) return;
    const msg = input.trim();

    // Check for slash commands
    if (msg.startsWith('/')) {
      const cmdName = msg.split(' ')[0].toLowerCase();
      const commands = getFilteredCommands(cmdName);
      if (commands.some((c) => c.name === cmdName)) {
        handleSlashCommand(cmdName);
        return;
      }
    }

    setInput('');
    setIsSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: msg }] }]);
    try {
      await sendClaudeMessage(sessionId, msg);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Error: ${String(e)}` }] }]);
      setIsSending(false);
    }
    inputRef.current?.focus();
  }, [sessionId, input, isSending, handleSlashCommand]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    await stopSession(sessionId);
    setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Session stopped.' }] }]);
    setSessionId(null);
    setIsSending(false);
  }, [sessionId]);

  // Show/hide slash command menu based on input
  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith('/') && value.length >= 1 && !value.includes(' ')) {
      setShowSlashMenu(true);
      setSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
    setShowModelPicker(false);
  };

  // Handle keyboard nav in slash menu
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommands(input);
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && filtered.length > 0)) {
        e.preventDefault();
        const cmd = filtered[slashIndex];
        if (cmd) {
          handleSlashCommand(cmd.name);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
    }
    if (showModelPicker && e.key === 'Escape') {
      setShowModelPicker(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: '#161b22',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{windowTitle}</span>
            {sessionId && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
            )}
            {model && (
              <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', padding: '1px 6px', borderRadius: 8 }}>
                {model}
              </span>
            )}
            {isSending && (
              <span style={{ fontSize: 11, color: '#d29922', fontStyle: 'italic' }}>thinking...</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setIsVerbose(!isVerbose)}
              style={{
                background: isVerbose ? '#1a2332' : '#21262d',
                border: `1px solid ${isVerbose ? '#1f6feb' : '#30363d'}`,
                color: isVerbose ? '#58a6ff' : '#8b949e',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {isVerbose ? 'Verbose' : 'Conversation'}
            </button>
            {!sessionId && workingDir ? (
              <button
                onClick={() => startClaude(workingDir)}
                disabled={isStarting}
                style={{
                  background: '#238636',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '4px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isStarting ? 'default' : 'pointer',
                  opacity: isStarting ? 0.6 : 1,
                }}
              >
                {isStarting ? 'Starting...' : 'Restart'}
              </button>
            ) : sessionId ? (
              <button
                onClick={handleStop}
                style={{
                  background: '#21262d',
                  border: '1px solid #da3633',
                  color: '#f85149',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
            ) : null}
          </div>
        </div>

        {/* Messages */}
        <div ref={outputRef} style={{
          flex: 1,
          overflow: 'auto',
          background: '#010409',
        }}>
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} isVerbose={isVerbose} sessionId={sessionId || undefined} />
          ))}
        </div>

        {/* Input */}
        {sessionId && (
          <div style={{
            padding: 8,
            borderTop: '1px solid #21262d',
            background: '#0d1117',
            display: 'flex',
            gap: 6,
            flexShrink: 0,
            position: 'relative',
          }}>
            {/* Slash command autocomplete */}
            {showSlashMenu && (
              <SlashCommandMenu
                filter={input}
                onSelect={handleSlashCommand}
                onClose={() => setShowSlashMenu(false)}
                selectedIndex={slashIndex}
              />
            )}
            {/* Model picker */}
            {showModelPicker && (
              <ModelPicker
                currentModel={model}
                onSelect={handleModelSelect}
                onClose={() => setShowModelPicker(false)}
              />
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={isSending ? 'Claude is thinking...' : 'Type a message or / for commands...'}
              disabled={isSending}
              style={{
                flex: 1,
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#e0e0e0',
                padding: '8px 12px',
                fontSize: 13,
                outline: 'none',
                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                opacity: isSending ? 0.6 : 1,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              style={{
                background: input.trim() && !isSending ? '#238636' : '#21262d',
                border: 'none',
                color: input.trim() && !isSending ? '#fff' : '#484f58',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: input.trim() && !isSending ? 'pointer' : 'default',
              }}
            >
              Send
            </button>
          </div>
        )}
      </div>

      {/* Collapsible palette sidebar — RIGHT side */}
      {paletteOpen ? (
        <div style={{
          width: 220,
          borderLeft: '1px solid #21262d',
          background: '#0d1117',
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
              color: '#8b949e',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #21262d',
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
            padding: 16, color: '#484f58', fontSize: 12, textAlign: 'center',
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
            borderLeft: '1px solid #21262d',
            background: '#0d1117',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: 10,
            fontWeight: 600,
            color: '#484f58',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.color = '#8b949e'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0d1117'; e.currentTarget.style.color = '#484f58'; }}
        >
          Skills & Flows
        </div>
      )}
    </div>
  );
}
