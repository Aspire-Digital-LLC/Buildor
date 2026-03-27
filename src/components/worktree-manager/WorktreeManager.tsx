import { useState, useEffect, useCallback } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listSessions, closeSession, closeAllSessions } from '@/utils/commands/worktree';
import { logEvent } from '@/utils/commands/logging';
import type { SessionInfo } from '@/types';

const typeColors: Record<string, string> = {
  feature: '#3fb950',
  bug: '#f85149',
  issue: '#d29922',
  documentation: '#58a6ff',
  release: '#a371f7',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorktreeManager() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closingProject, setClosingProject] = useState<string | null>(null);
  const [showGlobalConfirm, setShowGlobalConfirm] = useState(false);
  const [globalConfirmText, setGlobalConfirmText] = useState('');

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch {
      // silently fail
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleClose = async (session: SessionInfo) => {
    if (closing === session.sessionId) {
      try {
        await closeSession({
          sessionId: session.sessionId,
          projectName: session.projectName,
          repoPath: session.repoPath,
          worktreePath: session.worktreePath,
        });
        logEvent({
          sessionId: session.sessionId,
          repo: session.repoPath,
          functionArea: 'worktree',
          level: 'info',
          operation: 'close-session',
          message: `Closed session: ${session.branchName}`,
        }).catch(() => {});
        await loadSessions();
      } catch (e) {
        logEvent({
          sessionId: session.sessionId,
          repo: session.repoPath,
          functionArea: 'worktree',
          level: 'error',
          operation: 'close-session',
          message: `Failed to close: ${String(e)}`,
        }).catch(() => {});
      }
      setClosing(null);
    } else {
      setClosing(session.sessionId);
      setTimeout(() => setClosing(null), 3000);
    }
  };

  const handleCloseProject = async (projectName: string) => {
    if (closingProject === projectName) {
      try {
        await closeAllSessions(projectName);
        logEvent({
          functionArea: 'worktree',
          level: 'info',
          operation: 'close-all-project',
          message: `Closed all sessions for: ${projectName}`,
        }).catch(() => {});
        await loadSessions();
      } catch (e) {
        logEvent({
          functionArea: 'worktree',
          level: 'error',
          operation: 'close-all-project',
          message: `Failed: ${String(e)}`,
        }).catch(() => {});
      }
      setClosingProject(null);
    } else {
      setClosingProject(projectName);
      setTimeout(() => setClosingProject(null), 3000);
    }
  };

  const handleGlobalClose = async () => {
    if (globalConfirmText === 'close all') {
      try {
        await closeAllSessions();
        logEvent({
          functionArea: 'worktree',
          level: 'info',
          operation: 'close-all-global',
          message: `Closed all ${sessions.length} session(s)`,
        }).catch(() => {});
        await loadSessions();
      } catch (e) {
        logEvent({
          functionArea: 'worktree',
          level: 'error',
          operation: 'close-all-global',
          message: `Failed: ${String(e)}`,
        }).catch(() => {});
      }
      setShowGlobalConfirm(false);
      setGlobalConfirmText('');
    }
  };

  const openClaudeWindow = useCallback(async (session: SessionInfo) => {
    try {
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      const label = `claude-${session.sessionId.slice(0, 8)}`;

      const webview = new WebviewWindow(label, {
        url: '/',
        title: `Claude — ${session.branchName}`,
        width: Math.floor(screenWidth * 0.5),
        height: Math.floor(screenHeight * 0.85),
        x: Math.floor(screenWidth * 0.25),
        y: Math.floor(screenHeight * 0.05),
        theme: 'dark' as const,
      });

      webview.once('tauri://error', () => {});

      logEvent({
        sessionId: session.sessionId,
        repo: session.repoPath,
        functionArea: 'claude-chat',
        level: 'info',
        operation: 'launch-window',
        message: `Opened Claude window for: ${session.branchName}`,
      }).catch(() => {});
    } catch (e) {
      logEvent({
        functionArea: 'claude-chat',
        level: 'error',
        operation: 'launch-window',
        message: `Failed: ${String(e)}`,
      }).catch(() => {});
    }
  }, []);

  // Group by project
  const grouped: Record<string, SessionInfo[]> = {};
  for (const s of sessions) {
    if (!grouped[s.projectName]) grouped[s.projectName] = [];
    grouped[s.projectName].push(s);
  }
  const projectNames = Object.keys(grouped).sort();

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: 18 }}>Worktree Sessions</h2>
          {sessions.length > 0 && (
            <span style={{
              fontSize: 11,
              color: '#8b949e',
              background: '#21262d',
              padding: '1px 8px',
              borderRadius: 10,
            }}>
              {sessions.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={loadSessions}
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          {sessions.length > 0 && (
            <button
              onClick={() => setShowGlobalConfirm(!showGlobalConfirm)}
              style={{
                background: '#21262d',
                border: '1px solid #da3633',
                color: '#f85149',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Close All
            </button>
          )}
        </div>
      </div>

      {/* Global confirm */}
      {showGlobalConfirm && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 12,
          background: '#1a1a2e',
          border: '1px solid #6e3030',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#f85149' }}>Type "close all" to confirm:</span>
          <input
            autoFocus
            type="text"
            value={globalConfirmText}
            onChange={(e) => setGlobalConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGlobalClose(); }}
            style={{
              background: '#0d1117',
              border: '1px solid #da3633',
              borderRadius: 4,
              color: '#e0e0e0',
              padding: '4px 8px',
              fontSize: 12,
              outline: 'none',
              width: 100,
            }}
          />
          <button
            onClick={handleGlobalClose}
            disabled={globalConfirmText !== 'close all'}
            style={{
              background: globalConfirmText === 'close all' ? '#da3633' : '#21262d',
              color: globalConfirmText === 'close all' ? '#fff' : '#484f58',
              border: 'none',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: globalConfirmText === 'close all' ? 'pointer' : 'default',
            }}
          >
            Confirm
          </button>
          <button
            onClick={() => { setShowGlobalConfirm(false); setGlobalConfirmText(''); }}
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

      {/* Loading */}
      {isLoading && sessions.length === 0 && (
        <div style={{ color: '#6e7681', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Loading sessions...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sessions.length === 0 && (
        <div style={{
          color: '#8b949e',
          fontSize: 14,
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed #30363d',
          borderRadius: 8,
        }}>
          No active sessions. Use Start Session to begin.
        </div>
      )}

      {/* Grouped sessions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {projectNames.map((projectName) => {
          const projectSessions = grouped[projectName];
          const isConfirmingProject = closingProject === projectName;

          return (
            <div key={projectName}>
              {/* Project header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
                    {projectName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: '#8b949e',
                    background: '#21262d',
                    padding: '0 6px',
                    borderRadius: 8,
                  }}>
                    {projectSessions.length}
                  </span>
                </div>
                <button
                  onClick={() => handleCloseProject(projectName)}
                  style={{
                    background: isConfirmingProject ? '#da3633' : 'transparent',
                    color: isConfirmingProject ? '#fff' : '#6e7681',
                    border: isConfirmingProject ? '1px solid #da3633' : '1px solid transparent',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {isConfirmingProject ? 'Confirm Close All' : 'Close All'}
                </button>
              </div>

              {/* Session cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {projectSessions.map((session) => {
                  const isConfirmingClose = closing === session.sessionId;
                  return (
                    <div
                      key={session.sessionId}
                      onClick={() => openClaudeWindow(session)}
                      style={{
                        background: '#161b22',
                        border: '1px solid #21262d',
                        borderRadius: 8,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#21262d'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Branch + type badge */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: '#e0e0e0',
                              fontFamily: "'Cascadia Code', monospace",
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {session.branchName}
                            </span>
                            <span style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 8,
                              background: '#21262d',
                              color: typeColors[session.sessionType] || '#8b949e',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              {session.sessionType}
                            </span>
                          </div>
                          {/* Details row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#6e7681' }}>
                            <span>base: {session.baseBranch}</span>
                            {session.issueNumber && (
                              <span style={{ color: '#58a6ff' }}>#{session.issueNumber}</span>
                            )}
                            <span>{timeAgo(session.createdAt)}</span>
                          </div>
                          {/* Worktree path */}
                          <div style={{
                            fontSize: 11,
                            color: '#484f58',
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {session.worktreePath}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openClaudeWindow(session); }}
                            style={{
                              background: '#238636',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 12,
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                          >
                            Open
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleClose(session); }}
                            style={{
                              background: isConfirmingClose ? '#da3633' : '#21262d',
                              color: isConfirmingClose ? '#fff' : '#8b949e',
                              border: `1px solid ${isConfirmingClose ? '#da3633' : '#30363d'}`,
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            {isConfirmingClose ? 'Confirm' : 'Close'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
