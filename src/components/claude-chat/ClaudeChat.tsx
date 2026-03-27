import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { startClaudeSession, sendClaudeMessage } from '@/utils/commands/claude';
import { logEvent } from '@/utils/commands/logging';

interface OutputLine {
  text: string;
  type: 'stdout' | 'system';
}

export function ClaudeChat() {
  const { projectName } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Listen to Claude output events
  useEffect(() => {
    if (!sessionId) return;

    const unlistenOutput = listen<string>(`claude-output-${sessionId}`, (event) => {
      setOutput((prev) => [...prev, { text: event.payload, type: 'stdout' }]);
    });

    const unlistenExit = listen<string>(`claude-exit-${sessionId}`, () => {
      setOutput((prev) => [...prev, { text: '\n--- Claude session ended ---', type: 'system' }]);
      setSessionId(null);
      logEvent({
        repo: activeProject?.repoPath,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-end',
        message: `Claude session ended: ${sessionId}`,
      }).catch(() => {});
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
    };
  }, [sessionId]);

  const handleStart = useCallback(async () => {
    if (!activeProject) return;
    setIsStarting(true);
    setOutput([{ text: `Starting Claude in ${activeProject.repoPath}...`, type: 'system' }]);

    try {
      const sid = await startClaudeSession(activeProject.repoPath);
      setSessionId(sid);
      setOutput((prev) => [...prev, { text: `Session started (${sid.slice(0, 8)})`, type: 'system' }]);
      logEvent({
        repo: activeProject.repoPath,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'session-start',
        message: `Claude session started: ${sid}`,
      }).catch(() => {});
      inputRef.current?.focus();
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Failed to start: ${String(e)}`, type: 'system' }]);
      logEvent({
        repo: activeProject.repoPath,
        functionArea: 'claude-chat',
        level: 'error',
        operation: 'session-start',
        message: `Failed to start Claude: ${String(e)}`,
      }).catch(() => {});
    }
    setIsStarting(false);
  }, [activeProject]);

  const handleSend = useCallback(async () => {
    if (!sessionId || !input.trim()) return;
    const msg = input.trim();
    setInput('');
    setOutput((prev) => [...prev, { text: `> ${msg}`, type: 'system' }]);
    try {
      await sendClaudeMessage(sessionId, msg);
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Error sending: ${String(e)}`, type: 'system' }]);
    }
  }, [sessionId, input]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { stopSession } = await import('@/utils/commands/claude');
      await stopSession(sessionId);
      setOutput((prev) => [...prev, { text: '\n--- Session stopped ---', type: 'system' }]);
      setSessionId(null);
    } catch (e) {
      setOutput((prev) => [...prev, { text: `Error stopping: ${String(e)}`, type: 'system' }]);
    }
  }, [sessionId]);

  if (!activeProject) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6e7681',
        fontSize: 14,
      }}>
        Select a project to start a Claude session
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>Claude Chat</span>
          <span style={{
            fontSize: 11,
            color: '#8b949e',
            background: '#21262d',
            padding: '1px 6px',
            borderRadius: 10,
          }}>
            {activeProject.name}
          </span>
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
          {!sessionId ? (
            <button
              onClick={handleStart}
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
              {isStarting ? 'Starting...' : 'Start Claude'}
            </button>
          ) : (
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

      {/* Output area */}
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
        {output.length === 0 && !sessionId && (
          <div style={{ color: '#484f58', textAlign: 'center', padding: 40 }}>
            Click "Start Claude" to begin a session in {activeProject.name}
          </div>
        )}
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
  );
}
