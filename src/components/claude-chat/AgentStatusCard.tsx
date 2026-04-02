import { useState } from 'react';
import type { AgentPoolAgent } from '@/hooks/useAgentPool';
import { healthIcon } from '@/hooks/useAgentPool';

interface AgentStatusCardProps {
  agents: AgentPoolAgent[];
  onOpenPanel: () => void;
}

const statusIconSvg = (state: string, status: string) => {
  if (status === 'completed') return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#3fb950" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === 'failed') return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#f85149" />
      <path d="M5 5l6 6M11 5l-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  const icon = healthIcon(state as any);
  if (icon === 'red') return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#f85149" />
      <path d="M8 4v5M8 11v1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  if (icon === 'amber') return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="#d29922" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
  // spinning (healthy)
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1.5s linear infinite' }}>
      <circle cx="8" cy="8" r="6" stroke="var(--border-secondary)" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

function AgentRow({ agent, depth = 0 }: { agent: AgentPoolAgent; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = agent.children.length > 0;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 0',
          paddingLeft: depth * 16,
          cursor: 'pointer',
          fontSize: 12,
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <svg
            width="10" height="10" viewBox="0 0 10 10"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
          >
            <path d="M3 1l4 4-4 4" stroke="var(--text-tertiary)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        )}
        {!hasChildren && <div style={{ width: 10 }} />}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {statusIconSvg(agent.healthState, agent.status)}
        </div>
        <span style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 120,
        }}>
          {agent.name}
        </span>
        <span style={{
          flex: 1,
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: 11,
        }}>
          {agent.statusLine}
        </span>
      </div>
      {expanded && depth < 2 && agent.children.map((child) => (
        <AgentRow key={child.sessionId} agent={child} depth={depth + 1} />
      ))}
      {expanded && depth >= 2 && agent.children.length > 0 && (
        <div style={{ paddingLeft: (depth + 1) * 16, fontSize: 10, color: 'var(--text-tertiary)', padding: '2px 0' }}>
          {agent.children.length} more...
        </div>
      )}
    </>
  );
}

export function AgentStatusCard({ agents, onOpenPanel }: AgentStatusCardProps) {
  if (agents.length === 0) return null;

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        padding: '6px 12px',
        flexShrink: 0,
        cursor: 'pointer',
      }}
      onClick={onOpenPanel}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: agents.length > 1 ? 2 : 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6" stroke="var(--accent-primary)" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2" fill="var(--accent-primary)" />
          <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="var(--accent-primary)" strokeWidth="1" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Agents
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--accent-primary)',
          background: 'var(--bg-active)',
          padding: '0 5px',
          borderRadius: 8,
          fontWeight: 600,
        }}>
          {agents.length}
        </span>
      </div>
      {agents.map((agent) => (
        <AgentRow key={agent.sessionId} agent={agent} />
      ))}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
