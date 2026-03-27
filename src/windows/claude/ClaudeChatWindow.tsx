import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { startClaudeSession, sendClaudeMessage, stopSession } from '@/utils/commands/claude';
import { logEvent } from '@/utils/commands/logging';

interface OutputLine {
  text: string;
  type: 'stdout' | 'system';
}

export function ClaudeChatWindow() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [windowTitle, setWindowTitle] = useState('Claude Chat');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract working dir from window title (set by the creator)
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    appWindow.title().then((t) => {
      setWindowTitle(t);
      // Extract the branch path after "Claude — "
      const match = t.match(/Claude — (.+)/);
      if (match) {
        setWindowTitle(t);
      }
    }).catch(() => {});
  }, []);

  // Auto-start: look for the session's worktree path from saved sessions
  useEffect(() => {
    const findWorktreePath = async () => {
      try {
        const { listSessions } = await import('@/utils/commands/worktree');
        const sessions = await listSessions();
        // Match based on the window label which contains the session ID prefix
        const appWindow = getCurrentWebviewWindow();
        const label = appWindow.label; // "claude-{sessionIdPrefix}"
        const idPrefix = label.replace('claude-', '');

        const session = sessions.find((s) => s.sessionId.startsWith(idPrefix));
        if (session) {
          setWorkingDir(session.worktreePath);
          setOutput([{ text: `Session: ${session.branchName}`, type: 'system' },
                     { text: `Worktree: ${session.worktreePath}`, type: 'system' },
                     { text: '', type: 'system' }]);
          // Auto-start Claude
          startClaude(session.worktreePath);
        } else {
          setOutput([{ text: 'Could not find session. Start Claude manually.', type: 'system' }]);
        }
      } catch (e) {
        setOutput([{ text: `Error: ${String(e)}`, type: 'system' }]);
      }
    };
    findWorktreePath();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Listen to events
  useEffect(() => {
    if (!sessionId) return;

    const unlistenOutput = listen<string>(`claude-output-${sessionId}`, (event) => {
      setOutput((prev) => [...prev, { text: event.payload, type: 'stdout' }]);
    });

    const unlistenDone = listen<string>(`claude-done-${sessionId}`, () => {
      // Message completed — session stays active, just ready for next input
      setOutput((prev) => [...prev, { text: '', type: 'system' }]);
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenDone.then((fn) => fn());
    };
  }, [sessionId]);

  const startClaude = async (dir: string) => {
    setIsStarting(true);
    setOutput((prev) => [...prev, { text: `Starting Claude in ${dir}...`, type: 'system' }]);
    try {
      const sid = await startClaudeSession(dir);
      setSessionId(sid);
      setOutput((prev) => [...prev, { text: `Claude started (${sid.slice(0, 8)})`, type: 'system' }, { text: '', type: 'system' }]);
      logEvent({
        repo: dir,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-start',
        message: `Claude session started in breakout window: ${sid}`,
      }).catch(() => {});
      inputRef.current?.focus();
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Failed: ${String(e)}`, type: 'system' }]);
      logEvent({
        functionArea: 'claude-chat',
        level: 'error',
        operation: 'session-start',
        message: `Failed: ${String(e)}`,
      }).catch(() => {});
    }
    setIsStarting(false);
  };

  const handleSend = useCallback(async () => {
    if (!sessionId || !input.trim()) return;
    const msg = input.trim();
    setInput('');
    setOutput((prev) => [...prev, { text: `> ${msg}`, type: 'system' }]);
    try {
      await sendClaudeMessage(sessionId, msg);
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Error: ${String(e)}`, type: 'system' }]);
    }
  }, [sessionId, input]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    try {
      await stopSession(sessionId);
      setOutput((prev) => [...prev, { text: '\n--- Session stopped ---', type: 'system' }]);
      setSessionId(null);
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Error: ${String(e)}`, type: 'system' }]);
    }
  }, [sessionId]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Skill palette sidebar — placeholder for now */}
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
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#3fb950',
                display: 'inline-block',
              }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!sessionId && workingDir && (
              <button
                onClick={() => startClaude(workingDir)}
                disabled={isStarting}
                style={{
                  background: '#238636',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '5px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isStarting ? 'default' : 'pointer',
                  opacity: isStarting ? 0.6 : 1,
                }}
              >
                {isStarting ? 'Starting...' : 'Restart Claude'}
              </button>
            )}
            {sessionId && (
              <button
                onClick={handleStop}
                style={{
                  background: '#21262d',
                  border: '1px solid #da3633',
                  color: '#f85149',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Output */}
        <div
          ref={outputRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 12,
            background: '#010409',
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {output.map((line, i) => (
            <div key={i} style={{
              color: line.type === 'system' ? '#6e7681' : '#e0e0e0',
              fontStyle: line.type === 'system' ? 'italic' : 'normal',
            }}>
              {line.text}
            </div>
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
              placeholder="Type a message..."
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
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                background: input.trim() ? '#238636' : '#21262d',
                border: 'none',
                color: input.trim() ? '#fff' : '#484f58',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: input.trim() ? 'pointer' : 'default',
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
