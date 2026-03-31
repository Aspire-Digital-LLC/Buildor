import { useState, useEffect, useCallback } from 'react';
import {
  listChatSessions,
  getChatMessages,
  generateChatTitle,
  type ChatSession,
  type ChatMessageRecord,
} from '@/utils/commands/chatHistory';
import { ChatMessage, type ParsedMessage, type ChatContent } from './ChatMessage';

interface ChatHistoryProps {
  projectName: string;
  worktreeSessionId?: string | null;
  currentSessionId?: string | null;
  awareSessions: Set<string>;
  onToggleAware: (sessionId: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export function ChatHistory({
  projectName,
  worktreeSessionId,
  currentSessionId,
  awareSessions,
  onToggleAware,
  isOpen,
  onToggleOpen,
}: ChatHistoryProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [viewMessages, setViewMessages] = useState<ChatMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Load session list
  const loadSessions = useCallback(async () => {
    if (!projectName) return;
    try {
      const result = await listChatSessions(projectName, worktreeSessionId || null);
      setSessions(result);
      // Retroactively generate titles for untitled sessions with enough messages
      for (const s of result) {
        if (!s.title && s.messageCount >= 3) {
          generateChatTitle(s.id).then((title) => {
            setSessions((prev) =>
              prev.map((p) => (p.id === s.id ? { ...p, title } : p))
            );
          }).catch(() => {});
        }
      }
    } catch {
      // silent
    }
  }, [projectName, worktreeSessionId]);

  useEffect(() => {
    if (isOpen) loadSessions();
  }, [isOpen, loadSessions]);

  // Refresh when current session changes (new session started)
  useEffect(() => {
    if (isOpen && currentSessionId) loadSessions();
  }, [currentSessionId, isOpen, loadSessions]);

  const handleViewSession = async (sessionId: string) => {
    if (viewingSessionId === sessionId) {
      setViewingSessionId(null);
      setViewMessages([]);
      return;
    }
    setViewingSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const msgs = await getChatMessages(sessionId);
      setViewMessages(msgs);
    } catch {
      setViewMessages([]);
    }
    setLoadingMessages(false);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  // Convert a ChatMessageRecord to a ParsedMessage for rendering
  const toParsedMessage = (rec: ChatMessageRecord): ParsedMessage => {
    let content: ChatContent[];
    try {
      content = JSON.parse(rec.contentJson);
    } catch {
      content = [{ type: 'text', text: rec.contentJson }];
    }
    return {
      role: rec.role as ParsedMessage['role'],
      content,
      model: rec.model || undefined,
      costUsd: rec.costUsd || undefined,
      durationMs: rec.durationMs || undefined,
      isResult: rec.isResult || undefined,
    };
  };

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
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-secondary)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-primary)';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        History
      </div>
    );
  }

  return (
    <div
      style={{
        width: 280,
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
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
        History
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Session list / viewer */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewingSessionId ? (
          // Read-only transcript viewer
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              onClick={() => {
                setViewingSessionId(null);
                setViewMessages([]);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to list
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-inset)' }}>
              {loadingMessages ? (
                <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
                  Loading...
                </div>
              ) : (
                viewMessages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={toParsedMessage(msg)}
                    isVerbose={false}
                    activePermissionId={null}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          // Session list
          sessions.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
              No chat history yet
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border-primary)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                {/* Eyeball checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAware(s.id);
                  }}
                  title={awareSessions.has(s.id) ? 'Remove awareness' : 'Make Claude aware of this session'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    flexShrink: 0,
                    marginTop: 1,
                    opacity: awareSessions.has(s.id) ? 1 : 0.4,
                    color: awareSessions.has(s.id) ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!awareSessions.has(s.id)) e.currentTarget.style.opacity = '0.7';
                  }}
                  onMouseLeave={(e) => {
                    if (!awareSessions.has(s.id)) e.currentTarget.style.opacity = '0.4';
                  }}
                >
                  {/* Eyeball SVG */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>

                {/* Session info — clickable to view */}
                <div
                  onClick={() => handleViewSession(s.id)}
                  style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {s.id === currentSessionId && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#3fb950',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontStyle: s.title ? 'normal' : 'italic',
                      }}
                    >
                      {s.title || 'Untitled...'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--accent-primary)',
                      fontFamily: "'Cascadia Code', monospace",
                      marginTop: 1,
                    }}
                  >
                    {s.branchName}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {formatDate(s.startedAt)} · {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
