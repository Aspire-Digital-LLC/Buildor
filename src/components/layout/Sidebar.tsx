import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTabStore, useProjectStore } from '@/stores';
import { getGitStatus } from '@/utils/commands/git';
import { listSessions } from '@/utils/commands/worktree';
import { checkForUpdate } from '@/utils/commands/config';
import { buildorEvents } from '@/utils/buildorEvents';
import { StartSessionModal } from '../session/StartSessionModal';
import type { PanelType, SessionInfo } from '@/types';

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const icons: Record<string, ReactNode> = {
  sourceControl: (
    <svg {...iconProps}>
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 8.5c0 4-3 4.5-6 4.5s-6 .5-6 4.5" />
    </svg>
  ),
  codeViewer: (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  flowBuilder: (
    <svg {...iconProps}>
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="9.5" y="8" width="5" height="5" rx="1" />
      <rect x="18" y="8" width="5" height="5" rx="1" />
      <path d="M6 10.5h3.5M14.5 10.5H18" />
    </svg>
  ),
  claudeChat: (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  ),
  commandPalette: (
    <svg {...iconProps}>
      <path d="M4 17l6-6-6-6M12 19h8" />
    </svg>
  ),
  worktrees: (
    <svg {...iconProps}>
      <path d="M6 3v18" />
      <path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <path d="M6 15h4a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <circle cx="20" cy="13" r="1.5" />
      <circle cx="20" cy="19" r="1.5" />
    </svg>
  ),
  projects: (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavItem {
  panelType: PanelType;
  icon: ReactNode;
  label: string;
  requiresProject: boolean;
}

const navItems: NavItem[] = [
  { panelType: 'source-control', icon: icons.sourceControl, label: 'Source Control', requiresProject: true },
  { panelType: 'code-viewer', icon: icons.codeViewer, label: 'Code Viewer', requiresProject: true },
  { panelType: 'flow-builder', icon: icons.flowBuilder, label: 'Flow Builder', requiresProject: false },
  { panelType: 'claude-chat', icon: icons.claudeChat, label: 'Claude Chat', requiresProject: true },
  { panelType: 'command-palette', icon: icons.commandPalette, label: 'Command Palette', requiresProject: false },
  { panelType: 'worktree-manager', icon: icons.worktrees, label: 'Worktrees', requiresProject: false },
];

export function Sidebar() {
  const { openTab, tabs, activeTabId } = useTabStore();
  const { projects } = useProjectStore();
  const [dropdown, setDropdown] = useState<{ panelType: PanelType; rect: DOMRect } | null>(null);
  const [showStartSession, setShowStartSession] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track uncommitted change counts per project name AND per path (for worktrees)
  const [changeCounts, setChangeCounts] = useState<Record<string, number>>({});
  // changeCounts keyed by both project name (for badge) and repoPath (for dropdown)

  const refreshChangeCounts = useCallback(async () => {
    const currentProjects = useProjectStore.getState().projects;
    if (currentProjects.length === 0) return;
    const counts: Record<string, number> = {};

    // Get counts for main repo paths
    await Promise.all(
      currentProjects.map(async (p) => {
        try {
          const status = await getGitStatus(p.repoPath);
          const c = status.staged.length + status.unstaged.length + status.untracked.length;
          counts[p.name] = c;
          counts[p.repoPath] = c;
        } catch {
          counts[p.name] = 0;
          counts[p.repoPath] = 0;
        }
      })
    );

    // Also get counts for active worktree sessions
    try {
      const activeSessions = await listSessions();
      await Promise.all(
        activeSessions.map(async (s) => {
          try {
            const status = await getGitStatus(s.worktreePath);
            counts[s.worktreePath] = status.staged.length + status.unstaged.length + status.untracked.length;
          } catch {
            counts[s.worktreePath] = 0;
          }
        })
      );
    } catch {}

    setChangeCounts(counts);
  }, []);

  // Poll every 5 seconds + refresh immediately on branch switch
  useEffect(() => {
    refreshChangeCounts();
    const interval = setInterval(refreshChangeCounts, 5000);
    const handler = () => refreshChangeCounts();
    buildorEvents.on('branch-switched', handler);
    return () => {
      clearInterval(interval);
      buildorEvents.off('branch-switched', handler);
    };
  }, [refreshChangeCounts, projects]);

  // Sum only by project name (not paths) to avoid double-counting
  const totalChanges = projects.reduce((sum, p) => sum + (changeCounts[p.name] || 0), 0);

  // Track open session count
  const [sessionCount, setSessionCount] = useState(0);

  const refreshSessionCount = useCallback(async () => {
    try {
      const sessions = await listSessions();
      setSessionCount(sessions.length);
    } catch {
      setSessionCount(0);
    }
  }, []);

  useEffect(() => {
    refreshSessionCount();
    const interval = setInterval(refreshSessionCount, 5000);
    return () => clearInterval(interval);
  }, [refreshSessionCount]);

  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    checkForUpdate()
      .then(([, , needs]) => setHasUpdate(needs))
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdown]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleNavClick = async (item: NavItem, e: React.MouseEvent<HTMLButtonElement>) => {
    if (item.requiresProject) {
      // Ensure projects are loaded
      let currentProjects = projects;
      if (currentProjects.length === 0) {
        await useProjectStore.getState().loadProjects();
        currentProjects = useProjectStore.getState().projects;
      }
      if (currentProjects.length === 0) {
        openTab('settings');
        return;
      }
      // Code Viewer, Source Control, and Claude Chat show grouped dropdown
      if (item.panelType === 'code-viewer' || item.panelType === 'source-control' || item.panelType === 'claude-chat') {
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdown({ panelType: item.panelType, rect });
        listSessions().then((s) => setSessions(s)).catch(() => setSessions([]));
        return;
      }
      if (currentProjects.length === 1) {
        openTab(item.panelType, currentProjects[0].name);
        return;
      }
      // Multiple projects — show dropdown
      const rect = e.currentTarget.getBoundingClientRect();
      setDropdown({ panelType: item.panelType, rect });
    } else {
      openTab(item.panelType);
    }
  };

  return (
    <nav style={{
      width: 56,
      backgroundColor: '#0d1117',
      borderRight: '1px solid #21262d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      gap: 4,
      position: 'relative',
    }}>
      {/* Start Session — primary action */}
      <button
        onClick={() => setShowStartSession(true)}
        title="Start Session"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderLeft: '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: '#8b949e',
          marginBottom: 4,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </button>

      {navItems.map((item) => {
        const isActive = activeTab?.panelType === item.panelType;
        const badge =
          item.panelType === 'source-control' && totalChanges > 0 ? totalChanges :
          item.panelType === 'worktree-manager' && sessionCount > 0 ? sessionCount :
          null;
        return (
          <button
            key={item.panelType}
            onClick={(e) => handleNavClick(item, e)}
            title={item.label}
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: isActive ? '#1a1a2e' : 'transparent',
              border: 'none',
              borderLeft: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 4,
              color: isActive ? '#e0e0e0' : '#8b949e',
              position: 'relative',
            }}
          >
            {item.icon}
            {badge !== null && (
              <span style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#1f6feb',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
              }}>
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Settings button */}
      <button
        onClick={() => openTab('settings')}
        title="Settings"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          background: activeTab?.panelType === 'settings' ? '#1a1a2e' : 'transparent',
          border: 'none',
          borderLeft: activeTab?.panelType === 'settings' ? '2px solid #58a6ff' : '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: activeTab?.panelType === 'settings' ? '#e0e0e0' : '#8b949e',
          marginBottom: 8,
          position: 'relative',
        }}
      >
        {icons.settings}
        {hasUpdate && (
          <span style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#d29922',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            !
          </span>
        )}
      </button>

      {/* Project dropdown */}
      {dropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: dropdown.rect.right + 4,
            top: dropdown.rect.top,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            width: (dropdown.panelType === 'code-viewer' || dropdown.panelType === 'source-control' || dropdown.panelType === 'claude-chat') ? 280 : 220,
            maxHeight: 400,
            overflowY: 'auto',
            zIndex: 200,
          }}
        >
          <div style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#6e7681',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: '1px solid #21262d',
          }}>
            {dropdown.panelType === 'code-viewer' ? 'Browse Code' : dropdown.panelType === 'source-control' ? 'Source Control' : dropdown.panelType === 'claude-chat' ? 'Claude Chat' : 'Select Project'}
          </div>

          {(dropdown.panelType === 'code-viewer' || dropdown.panelType === 'source-control' || dropdown.panelType === 'claude-chat') ? (
            /* Grouped by project with checked-out branch + worktrees */
            projects.map((project) => {
              const projectSessions = sessions.filter(
                (s) => s.repoPath.replace(/\\/g, '/') === project.repoPath.replace(/\\/g, '/')
              );
              return (
                <div key={project.name}>
                  {/* Project name header (not clickable) */}
                  <div style={{
                    padding: '8px 12px 2px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e0e0e0',
                  }}>
                    {project.name}
                  </div>

                  {/* Checked out branch */}
                  <div style={{
                    padding: '2px 12px 2px 20px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#6e7681',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    marginTop: 4,
                  }}>
                    Checked out
                  </div>
                  <div
                    onClick={() => {
                      openTab(dropdown.panelType, project.name, {
                        browsePath: project.repoPath,
                        browseBranch: project.currentBranch || 'main',
                        browseIsWorktree: false,
                      });
                      setDropdown(null);
                    }}
                    style={{
                      padding: '4px 12px 4px 28px',
                      fontSize: 12,
                      color: '#58a6ff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.currentBranch || 'main'}</span>
                    {dropdown.panelType === 'source-control' && (changeCounts[project.repoPath] || 0) > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, borderRadius: 9,
                        backgroundColor: '#1f6feb', color: '#fff',
                        fontSize: 10, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', flexShrink: 0,
                      }}>
                        {changeCounts[project.repoPath]}
                      </span>
                    )}
                  </div>

                  {/* Worktrees (only for code-viewer and source-control, not claude-chat) */}
                  {dropdown.panelType !== 'claude-chat' && projectSessions.length > 0 && (
                    <>
                      <div style={{
                        padding: '6px 12px 2px 20px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#6e7681',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}>
                        Worktrees
                      </div>
                      {projectSessions.map((session) => (
                        <div
                          key={session.sessionId}
                          onClick={() => {
                            openTab(dropdown.panelType, project.name, {
                              browsePath: session.worktreePath,
                              browseBranch: session.branchName,
                              browseIsWorktree: true,
                            });
                            setDropdown(null);
                          }}
                          style={{
                            padding: '4px 12px 4px 28px',
                            fontSize: 12,
                            color: '#d2a8ff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 3v18" /><path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
                          </svg>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.branchName}</span>
                          {dropdown.panelType === 'source-control' && (changeCounts[session.worktreePath] || 0) > 0 && (
                            <span style={{
                              minWidth: 18, height: 18, borderRadius: 9,
                              backgroundColor: '#1f6feb', color: '#fff',
                              fontSize: 10, fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 4px', flexShrink: 0,
                            }}>
                              {changeCounts[session.worktreePath]}
                            </span>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Divider between projects */}
                  <div style={{ borderBottom: '1px solid #21262d', margin: '4px 0' }} />
                </div>
              );
            })
          ) : (
            /* Default: flat project list for source-control etc. */
            projects.map((project) => {
              const count = changeCounts[project.name] || 0;
              return (
                <div
                  key={project.name}
                  onClick={() => {
                    openTab(dropdown.panelType, project.name);
                    setDropdown(null);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#e0e0e0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{project.name}</div>
                    {project.currentBranch && (
                      <div style={{ fontSize: 11, color: '#6e7681', marginTop: 1 }}>
                        {project.currentBranch}
                      </div>
                    )}
                  </div>
                  {dropdown.panelType === 'source-control' && count > 0 && (
                    <span style={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#1f6feb',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      flexShrink: 0,
                    }}>
                      {count}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Start Session Modal */}
      {showStartSession && (
        <StartSessionModal
          onClose={() => setShowStartSession(false)}
          onSessionCreated={() => {
            // Don't close — modal shows success screen, user clicks "Done" to close
            refreshChangeCounts();
          }}
        />
      )}
    </nav>
  );
}
