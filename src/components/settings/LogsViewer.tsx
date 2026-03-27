import { useState, useEffect, useCallback } from 'react';
import { getLogs, clearLogs } from '@/utils/commands/logging';
import type { LogEntry } from '@/types';

const levelColors: Record<string, string> = {
  info: '#58a6ff',
  warn: '#d29922',
  error: '#f85149',
  debug: '#8b949e',
};

const functionIcons: Record<string, string> = {
  'source-control': 'SC',
  'code-viewer': 'CV',
  'claude-chat': 'CC',
  'flow-builder': 'FB',
  'worktree': 'WT',
  'project': 'PR',
  'system': 'SY',
};

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterRepo, setFilterRepo] = useState<string>('');
  const [filterFunction, setFilterFunction] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterSession, setFilterSession] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await getLogs({
        repo: filterRepo || undefined,
        functionArea: filterFunction || undefined,
        level: filterLevel || undefined,
        sessionId: filterSession || undefined,
        limit: 200,
      });
      setLogs(entries);
    } catch {
      // silently fail for now
    }
    setIsLoading(false);
  }, [filterRepo, filterFunction, filterLevel, filterSession]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const handleClear = async () => {
    if (clearConfirmText === 'clear all logs') {
      await clearLogs();
      await loadLogs();
      setClearConfirmOpen(false);
      setClearConfirmText('');
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>Logs</span>

        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          style={filterStyle}
        >
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>

        <select
          value={filterFunction}
          onChange={(e) => setFilterFunction(e.target.value)}
          style={filterStyle}
        >
          <option value="">All Functions</option>
          <option value="source-control">Source Control</option>
          <option value="code-viewer">Code Viewer</option>
          <option value="claude-chat">Claude Chat</option>
          <option value="flow-builder">Flow Builder</option>
          <option value="worktree">Worktree</option>
          <option value="project">Project</option>
          <option value="system">System</option>
        </select>

        <input
          type="text"
          placeholder="Filter by repo..."
          value={filterRepo}
          onChange={(e) => setFilterRepo(e.target.value)}
          style={{
            ...filterStyle,
            width: 120,
          }}
        />

        <input
          type="text"
          placeholder="Session ID..."
          value={filterSession}
          onChange={(e) => setFilterSession(e.target.value)}
          style={{
            ...filterStyle,
            width: 120,
          }}
        />

        <div style={{ flex: 1 }} />

        <button
          onClick={loadLogs}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
        <button
          onClick={() => setClearConfirmOpen(!clearConfirmOpen)}
          style={{
            background: '#21262d',
            border: '1px solid #da3633',
            color: '#f85149',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Clear All
        </button>
      </div>

      {/* Clear confirmation */}
      {clearConfirmOpen && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #6e3030',
          background: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#f85149' }}>
            Type "clear all logs" to confirm:
          </span>
          <input
            autoFocus
            type="text"
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleClear(); }}
            style={{
              background: '#0d1117',
              border: '1px solid #da3633',
              borderRadius: 4,
              color: '#e0e0e0',
              padding: '4px 8px',
              fontSize: 12,
              outline: 'none',
              width: 160,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleClear}
            disabled={clearConfirmText !== 'clear all logs'}
            style={{
              background: clearConfirmText === 'clear all logs' ? '#da3633' : '#21262d',
              color: clearConfirmText === 'clear all logs' ? '#fff' : '#484f58',
              border: 'none',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              cursor: clearConfirmText === 'clear all logs' ? 'pointer' : 'default',
              fontWeight: 600,
            }}
          >
            Confirm
          </button>
          <button
            onClick={() => { setClearConfirmOpen(false); setClearConfirmText(''); }}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#8b949e',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Log table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && logs.length === 0 && (
          <div style={{ padding: 16, color: '#6e7681', textAlign: 'center' }}>Loading...</div>
        )}

        {!isLoading && logs.length === 0 && (
          <div style={{ padding: 32, color: '#6e7681', textAlign: 'center', fontSize: 13 }}>
            No log entries
          </div>
        )}

        {/* Header */}
        {logs.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '140px 50px 60px 80px 80px auto 70px',
            gap: 0,
            fontSize: 11,
            fontWeight: 600,
            color: '#6e7681',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            padding: '6px 12px',
            borderBottom: '1px solid #21262d',
            position: 'sticky',
            top: 0,
            background: '#161b22',
            zIndex: 1,
          }}>
            <span>Time</span>
            <span>Level</span>
            <span>Func</span>
            <span>Repo</span>
            <span>Session</span>
            <span>Message</span>
            <span style={{ textAlign: 'right' }}>Duration</span>
          </div>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 50px 60px 80px 80px auto 70px',
              gap: 0,
              fontSize: 12,
              padding: '4px 12px',
              cursor: 'pointer',
              borderBottom: '1px solid #0d1117',
              color: '#adbac7',
              fontFamily: "'Cascadia Code', 'Consolas', monospace",
              background: selectedLog?.id === log.id ? '#1a2332' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (selectedLog?.id !== log.id) e.currentTarget.style.background = '#1c2128';
            }}
            onMouseLeave={(e) => {
              if (selectedLog?.id !== log.id) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: '#6e7681', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatTimestamp(log.timestamp)}
            </span>
            <span style={{
              color: levelColors[log.level] || '#8b949e',
              fontWeight: 600,
              fontSize: 10,
              textTransform: 'uppercase',
            }}>
              {log.level}
            </span>
            <span style={{
              fontSize: 10,
              background: '#21262d',
              borderRadius: 3,
              padding: '0 4px',
              display: 'inline-block',
              textAlign: 'center',
              color: '#8b949e',
              maxWidth: 50,
            }}>
              {functionIcons[log.functionArea] || log.functionArea.slice(0, 2).toUpperCase()}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6e7681' }}>
              {log.repo || '—'}
            </span>
            <span
              onClick={(e) => {
                if (log.sessionId) {
                  e.stopPropagation();
                  setFilterSession(log.sessionId);
                }
              }}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: log.sessionId ? '#58a6ff' : '#484f58',
                cursor: log.sessionId ? 'pointer' : 'default',
                fontSize: 10,
              }}
              title={log.sessionId ? `Filter by session: ${log.sessionId}` : ''}
            >
              {log.sessionId ? log.sessionId.slice(0, 8) : '—'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {log.operation}: {log.message}
            </span>
            <span style={{ textAlign: 'right', color: log.durationMs ? '#d29922' : '#484f58' }}>
              {formatDuration(log.durationMs)}
            </span>
          </div>
        ))}

        {/* Expanded detail view */}
        {selectedLog && selectedLog.details && (
          <div style={{
            padding: '8px 12px',
            background: '#0d1117',
            borderBottom: '1px solid #21262d',
            fontSize: 12,
            color: '#8b949e',
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {selectedLog.details}
          </div>
        )}
      </div>
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  color: '#e0e0e0',
  padding: '4px 8px',
  fontSize: 12,
  outline: 'none',
};
