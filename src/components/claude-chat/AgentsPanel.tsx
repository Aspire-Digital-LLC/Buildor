import { useState, useEffect } from 'react';
import type { AgentPoolAgent } from '@/hooks/useAgentPool';
import { healthIcon } from '@/hooks/useAgentPool';
import { ChatMessage, type ParsedMessage, type ChatContent } from './ChatMessage';
import type { ChatMessageRecord } from '@/utils/commands/chatHistory';

interface AgentsPanelProps {
  agents: AgentPoolAgent[];
  completedAgents: AgentPoolAgent[];
  activeCount: number;
  expandedAgentId: string | null;
  onExpandAgent: (id: string | null) => void;
  onGetMessages: (sessionId: string) => Promise<ChatMessageRecord[]>;
  isOpen: boolean;
  onToggleOpen: () => void;
}

const healthLabel: Record<string, string> = {
  healthy: 'Healthy',
  idle: 'Idle',
  stalling: 'Stalling',
  looping: 'Looping',
  erroring: 'Erroring',
  distressed: 'Distressed',
};

const healthColor: Record<string, string> = {
  healthy: 'var(--accent-primary)',
  idle: '#d29922',
  stalling: '#d29922',
  looping: '#d29922',
  erroring: '#f85149',
  distressed: '#f85149',
};

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

function StatusIcon({ state, status }: { state: string; status: string }) {
  if (status === 'completed') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#3fb950" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === 'failed') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#f85149" />
      <path d="M5 5l6 6M11 5l-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  const icon = healthIcon(state as any);
  if (icon === 'red') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#f85149">
        <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <path d="M8 4v5M8 11v1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  if (icon === 'amber') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="#d29922" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'agent-spin 1.5s linear infinite' }}>
      <circle cx="8" cy="8" r="6" stroke="var(--border-secondary)" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AgentTranscript({ sessionId, onGetMessages }: { sessionId: string; onGetMessages: (id: string) => Promise<ChatMessageRecord[]> }) {
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    onGetMessages(sessionId).then((records) => {
      const parsed: ParsedMessage[] = records.map((r) => ({
        role: r.role as ParsedMessage['role'],
        content: (typeof r.contentJson === 'string' ? JSON.parse(r.contentJson) : r.contentJson) as ChatContent[],
      }));
      setMessages(parsed);
    }).catch(() => {
      setMessages([]);
    }).finally(() => setLoading(false));
  }, [sessionId, onGetMessages]);

  if (loading) return <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>Loading transcript...</div>;
  if (messages.length === 0) return <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>No messages yet</div>;

  return (
    <div style={{ maxHeight: 300, overflow: 'auto', borderTop: '1px solid var(--border-primary)' }}>
      {messages.map((msg, i) => (
        <ChatMessage key={i} message={msg} isVerbose={false} />
      ))}
    </div>
  );
}

function AgentEntry({
  agent,
  isExpanded,
  onExpand,
  onGetMessages,
  depth = 0,
}: {
  agent: AgentPoolAgent;
  isExpanded: boolean;
  onExpand: (id: string | null) => void;
  onGetMessages: (id: string) => Promise<ChatMessageRecord[]>;
  depth?: number;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const isWaitingPermission = agent.healthState === 'idle'; // Simplified — real check would use permission events

  return (
    <div style={{
      borderBottom: depth === 0 ? '1px solid var(--border-primary)' : 'none',
      background: isWaitingPermission ? 'rgba(210, 153, 34, 0.08)' : 'transparent',
    }}>
      <div
        onClick={() => onExpand(isExpanded ? null : agent.sessionId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          paddingLeft: 12 + depth * 12,
          cursor: 'pointer',
          fontSize: 12,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isWaitingPermission ? 'rgba(210, 153, 34, 0.08)' : 'transparent'; }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
        >
          <path d="M3 1l4 4-4 4" stroke="var(--text-tertiary)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        <StatusIcon state={agent.healthState} status={agent.status} />
        <span style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 100,
        }}>
          {agent.name}
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontFamily: "'Cascadia Code', monospace",
          flexShrink: 0,
        }}>
          {formatDuration(agent.startedAt, agent.endedAt)}
        </span>
        <span style={{
          fontSize: 10,
          color: healthColor[agent.healthState] || 'var(--text-tertiary)',
          flexShrink: 0,
        }}>
          {healthLabel[agent.healthState] || agent.healthState}
        </span>
      </div>
      {isExpanded && (
        <div style={{ padding: '0 12px 8px', paddingLeft: 12 + depth * 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {agent.statusLine}
          </div>
          {agent.sourceSkill && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              Source: {agent.sourceSkill}
            </div>
          )}
          {agent.children.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {agent.children.map((child) => (
                <AgentEntry
                  key={child.sessionId}
                  agent={child}
                  isExpanded={false}
                  onExpand={onExpand}
                  onGetMessages={onGetMessages}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowTranscript(!showTranscript); }}
            style={{
              background: 'none',
              border: '1px solid var(--border-secondary)',
              color: 'var(--accent-primary)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            {showTranscript ? 'Hide transcript' : 'View transcript'}
          </button>
          {showTranscript && (
            <AgentTranscript sessionId={agent.sessionId} onGetMessages={onGetMessages} />
          )}
        </div>
      )}
    </div>
  );
}

export function AgentsPanel({
  agents,
  completedAgents,
  activeCount,
  expandedAgentId,
  onExpandAgent,
  onGetMessages,
  isOpen,
  onToggleOpen,
}: AgentsPanelProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  if (!isOpen) {
    return (
      <div
        onClick={onToggleOpen}
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
          color: activeCount > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          userSelect: 'none',
          position: 'relative',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = activeCount > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)'; }}
      >
        {activeCount > 0 && (
          <div style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#3fb950',
            animation: 'agent-pulse 2s ease-in-out infinite',
          }} />
        )}
        <span style={{ marginTop: activeCount > 0 ? 18 : 0 }}>Agents</span>
        {activeCount > 0 && (
          <span style={{
            fontSize: 9,
            background: 'var(--bg-active)',
            padding: '1px 4px',
            borderRadius: 6,
            marginTop: 4,
            writingMode: 'horizontal-tb',
          }}>
            {activeCount}
          </span>
        )}
        <style>{`
          @keyframes agent-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes agent-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      width: 250,
      borderLeft: '1px solid var(--border-primary)',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div
        onClick={onToggleOpen}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Agents
          {activeCount > 0 && (
            <span style={{
              fontSize: 10,
              color: 'var(--accent-primary)',
              background: 'var(--bg-active)',
              padding: '0 5px',
              borderRadius: 8,
              fontWeight: 600,
            }}>
              {activeCount}
            </span>
          )}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {agents.length === 0 && completedAgents.length === 0 && (
          <div style={{
            padding: 16,
            color: 'var(--text-tertiary)',
            fontSize: 12,
            textAlign: 'center',
          }}>
            No agents running
          </div>
        )}

        {/* Active agents */}
        {agents.map((agent) => (
          <AgentEntry
            key={agent.sessionId}
            agent={agent}
            isExpanded={expandedAgentId === agent.sessionId}
            onExpand={onExpandAgent}
            onGetMessages={onGetMessages}
          />
        ))}

        {/* Completed section */}
        {completedAgents.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-primary)' }}>
            <div
              onClick={() => setShowCompleted(!showCompleted)}
              style={{
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                userSelect: 'none',
              }}
            >
              <svg
                width="10" height="10" viewBox="0 0 10 10"
                style={{ transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
              >
                <path d="M3 1l4 4-4 4" stroke="var(--text-tertiary)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
              Completed ({completedAgents.length})
            </div>
            {showCompleted && completedAgents.map((agent) => (
              <AgentEntry
                key={agent.sessionId}
                agent={agent}
                isExpanded={expandedAgentId === agent.sessionId}
                onExpand={onExpandAgent}
                onGetMessages={onGetMessages}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
