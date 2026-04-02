import { useState } from 'react';

interface AgentOutputBlockProps {
  agentName: string;
  status: 'completed' | 'failed';
  summary: string;
  durationMs?: number;
}

export function AgentOutputBlock({ agentName, status, summary, durationMs }: AgentOutputBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isError = status === 'failed';

  return (
    <div style={{
      margin: '4px 12px',
      border: `1px solid ${isError ? 'rgba(248, 81, 73, 0.3)' : 'rgba(63, 185, 80, 0.3)'}`,
      borderRadius: 8,
      overflow: 'hidden',
      background: isError ? 'rgba(248, 81, 73, 0.04)' : 'rgba(63, 185, 80, 0.04)',
    }}>
      {/* Header badge */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${isError ? 'rgba(248, 81, 73, 0.2)' : 'rgba(63, 185, 80, 0.2)'}` : 'none',
        }}
      >
        {/* Agent icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke={isError ? '#f85149' : '#3fb950'} strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2" fill={isError ? '#f85149' : '#3fb950'} />
        </svg>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: isError ? '#f85149' : '#3fb950',
        }}>
          Agent: {agentName}
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          background: 'var(--border-primary)',
          padding: '0 5px',
          borderRadius: 6,
        }}>
          {status}
        </span>
        {durationMs !== undefined && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Cascadia Code', monospace" }}>
            {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <div style={{ flex: 1 }} />
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M3 1l4 4-4 4" stroke="var(--text-tertiary)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Summary content */}
      {expanded && (
        <div style={{
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
          maxHeight: 200,
          overflow: 'auto',
        }}>
          {summary || 'No output'}
        </div>
      )}

      {/* Collapsed preview — first line of summary */}
      {!expanded && summary && (
        <div style={{
          padding: '4px 12px 6px',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {summary.split('\n')[0]}
        </div>
      )}
    </div>
  );
}
