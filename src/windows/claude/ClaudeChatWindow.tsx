import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { startClaudeSession, sendClaudeMessage, stopSession } from '@/utils/commands/claude';
import { logEvent } from '@/utils/commands/logging';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { ChatMessage, type ParsedMessage } from '@/components/claude-chat/ChatMessage';

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
      const parsed = parseStreamEvent(event.payload);
      if (parsed) {
        if (parsed.model && !model) setModel(parsed.model);
        setMessages((prev) => [...prev, parsed]);
      }
    });

    const unlistenDone = listen<string>(`claude-done-${sessionId}`, () => {
      setIsSending(false);
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenDone.then((fn) => fn());
    };
  }, [sessionId, model]);

  const startClaude = async (dir: string) => {
    setIsStarting(true);
    try {
      const sid = await startClaudeSession(dir);
      setSessionId(sid);
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Claude ready.` }] }]);
      logEvent({
        repo: dir,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-start',
        message: `Claude session started: ${sid}`,
      }).catch(() => {});
      inputRef.current?.focus();
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Failed: ${String(e)}` }] }]);
    }
    setIsStarting(false);
  };

  const handleSend = useCallback(async () => {
    if (!sessionId || !input.trim() || isSending) return;
    const msg = input.trim();
    setInput('');
    setIsSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: msg }] }]);
    try {
      await sendClaudeMessage(sessionId, msg);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: `Error: ${String(e)}` }] }]);
      setIsSending(false);
    }
  }, [sessionId, input, isSending]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    await stopSession(sessionId);
    setMessages((prev) => [...prev, { role: 'system', content: [{ type: 'text', text: 'Session stopped.' }] }]);
    setSessionId(null);
    setIsSending(false);
  }, [sessionId]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Skill palette sidebar */}
      <div style={{
        width: 220,
        borderRight: '1px solid #21262d',
        background: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#8b949e',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid #21262d',
        }}>
          Skills & Flows
        </div>
        <div style={{
          padding: 16,
          color: '#484f58',
          fontSize: 12,
          textAlign: 'center',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          Command palette coming soon
        </div>
      </div>

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
            <ChatMessage key={i} message={msg} isVerbose={isVerbose} />
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
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isSending ? 'Claude is thinking...' : 'Type a message...'}
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
    </div>
  );
}
