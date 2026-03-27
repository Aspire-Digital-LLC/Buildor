import { useState, useEffect, useCallback } from 'react';
import { listSessions, closeSession, closeAllSessions } from '@/utils/commands/worktree';
import { openClaudeWindow } from '@/utils/commands/window';
import { logEvent } from '@/utils/commands/logging';
import type { SessionInfo } from '@/types';

const typeColors: Record<string, string> = {
  feature: '#3fb950',
  bug: '#f85149',
  issue: '#d29922',
  documentation: 'var(--accent-primary)',
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
  const [forceClosing, setForceClosing] = useState<string | null>(null);
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

  const handleClose = async (session: SessionInfo, force = false) => {
    if (force || closing === session.sessionId) {
      try {
        await closeSession({
          sessionId: session.sessionId,
          projectName: session.projectName,
          repoPath: session.repoPath,
          worktreePath: session.worktreePath,
          force,
        });
        logEvent({
          sessionId: session.sessionId,
          repo: session.repoPath,
          functionArea: 'worktree',
          level: 'info',
          operation: 'close-session',
          message: `Closed session: ${session.branchName}${force ? ' (forced)' : ''}`,
        }).catch(() => {});
        setForceClosing(null);
        await loadSessions();
      } catch (e) {
        const errMsg = String(e);
        // If the error is about unsaved work, offer force-close
        if (errMsg.includes('uncommitted') || errMsg.includes('unpushed') || errMsg.includes('never pushed')) {
          setForceClosing(session.sessionId);
          logEvent({
            sessionId: session.sessionId,
            repo: session.repoPath,
            functionArea: 'worktree',
            level: 'warn',
            operation: 'close-session',
            message: `Blocked close: ${errMsg}`,
          }).catch(() => {});
        } else {
          logEvent({
            sessionId: session.sessionId,
            repo: session.repoPath,
            functionArea: 'worktree',
            level: 'error',
            operation: 'close-session',
            message: `Failed to close: ${errMsg}`,
          }).catch(() => {});
        }
      }
      setClosing(null);
    } else {
      setClosing(session.sessionId);
      setForceClosing(null);
      setTimeout(() => setClosing(null), 5000);
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

  const handleOpenClaudeWindow = useCallback(async (session: SessionInfo) => {
    try {
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;

      await openClaudeWindow({
        label: `claude-${session.sessionId.slice(0, 8)}`,
        title: `Claude — ${session.branchName}`,
        width: Math.floor(screenWidth * 0.5),
        height: Math.floor(screenHeight * 0.85),
        x: Math.floor(screenWidth * 0.25),
        y: Math.floor(screenHeight * 0.05),
      });

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
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Worktree Sessions</h2>
          {sessions.length > 0 && (
            <span style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'var(--border-primary)',
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
              background: 'var(--border-primary)',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-primary)',
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
                background: 'var(--border-primary)',
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
          background: 'var(--bg-active)',
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
              background: 'var(--bg-primary)',
              border: '1px solid #da3633',
              borderRadius: 4,
              color: 'var(--text-primary)',
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
              background: globalConfirmText === 'close all' ? '#da3633' : 'var(--border-primary)',
              color: globalConfirmText === 'close all' ? '#fff' : 'var(--text-tertiary)',
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
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-secondary)',
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
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Loading sessions...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sessions.length === 0 && (
        <div style={{
          color: 'var(--text-secondary)',
          fontSize: 14,
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-secondary)',
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
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {projectName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    background: 'var(--border-primary)',
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
                    color: isConfirmingProject ? '#fff' : 'var(--text-tertiary)',
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
                      onClick={() => handleOpenClaudeWindow(session)}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Branch + type badge */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: 'var(--text-primary)',
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
                              background: 'var(--border-primary)',
                              color: typeColors[session.sessionType] || 'var(--text-secondary)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              {session.sessionType}
                            </span>
                          </div>
                          {/* Details row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                            <span>base: {session.baseBranch}</span>
                            {session.issueNumber && (
                              <span style={{ color: 'var(--accent-primary)' }}>#{session.issueNumber}</span>
                            )}
                            <span>{timeAgo(session.createdAt)}</span>
                          </div>
                          {/* Worktree path */}
                          <div style={{
                            fontSize: 11,
                            color: 'var(--text-tertiary)',
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
                            onClick={(e) => { e.stopPropagation(); handleOpenClaudeWindow(session); }}
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
                          {forceClosing === session.sessionId ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClose(session, true); }}
                              title="Has uncommitted or unpushed changes — click to force close anyway"
                              style={{
                                background: '#da3633',
                                color: '#fff',
                                border: '1px solid #f85149',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                            >
                              Force Close
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClose(session); }}
                              style={{
                                background: isConfirmingClose ? '#da3633' : 'var(--border-primary)',
                                color: isConfirmingClose ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${isConfirmingClose ? '#da3633' : 'var(--border-secondary)'}`,
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              {isConfirmingClose ? 'Confirm' : 'Close'}
                            </button>
                          )}
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
