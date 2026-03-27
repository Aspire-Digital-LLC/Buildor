import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '@/stores';
import { getLanguageStats } from '@/utils/commands/filesystem';
import { getGitStatus, gitListBranches } from '@/utils/commands/git';
import { listSessions, closeAllSessions, cleanWorktrees } from '@/utils/commands/worktree';
import { logEvent } from '@/utils/commands/logging';
import type { LanguageStat, SessionInfo } from '@/types';

interface WorktreeWarning {
  projectName: string;
  repoPath: string;
  sessions: Array<{
    session: SessionInfo;
    uncommittedChanges: number;
    branchNotOnRemote: boolean;
  }>;
}

export function ProjectSwitcher() {
  const {
    projects,
    isLoading,
    error,
    addProject,
    removeProject,
    loadProjects,
  } = useProjectStore();

  const [removing, setRemoving] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [langStats, setLangStats] = useState<Record<string, LanguageStat[]>>({});
  const [warning, setWarning] = useState<WorktreeWarning | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    projects.forEach((p) => {
      if (!langStats[p.name]) {
        getLanguageStats(p.repoPath).then((stats) => {
          setLangStats((prev) => ({ ...prev, [p.name]: stats }));
        }).catch(() => {});
      }
    });
  }, [projects]);

  const handleAddProject = async () => {
    setAddError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    });

    if (selected && typeof selected === 'string') {
      const parts = selected.replace(/\\/g, '/').split('/');
      const name = parts[parts.length - 1] || 'unnamed';
      try {
        await addProject(name, selected);
      } catch (e) {
        setAddError(String(e));
      }
    }
  };

  const handleRemove = async (name: string) => {
    if (removing === name) {
      // Second click — check for worktrees with unsaved work
      setIsChecking(true);
      const project = projects.find((p) => p.name === name);
      if (!project) return;

      try {
        const sessions = await listSessions();
        const projectSessions = sessions.filter(
          (s) => s.projectName === name || s.repoPath.replace(/\\/g, '/') === project.repoPath.replace(/\\/g, '/')
        );

        if (projectSessions.length > 0) {
          // Check each worktree for uncommitted changes and unpushed branches
          const checks = await Promise.all(
            projectSessions.map(async (session) => {
              let uncommittedChanges = 0;
              let branchNotOnRemote = false;
              try {
                const status = await getGitStatus(session.worktreePath);
                uncommittedChanges = status.staged.length + status.unstaged.length + status.untracked.length;
              } catch {}
              try {
                const branches = await gitListBranches(session.worktreePath);
                const current = branches.find((b) => b.current);
                if (current && !current.remote) {
                  branchNotOnRemote = true;
                }
              } catch {}
              return { session, uncommittedChanges, branchNotOnRemote };
            })
          );

          const hasRisks = checks.some((c) => c.uncommittedChanges > 0 || c.branchNotOnRemote);

          if (hasRisks) {
            setWarning({ projectName: name, repoPath: project.repoPath, sessions: checks });
            setIsChecking(false);
            return;
          }
        }

        // No risks — proceed with cleanup
        await doRemove(name, project.repoPath);
      } catch {
        // If checks fail, still allow removal
        await doRemove(name, project.repoPath);
      }
      setIsChecking(false);
    } else {
      setRemoving(name);
      setTimeout(() => setRemoving(null), 3000);
    }
  };

  const doRemove = async (name: string, repoPath: string) => {
    try {
      // Close all worktree sessions for this project
      await closeAllSessions(name).catch(() => {});
      // Prune any orphaned worktrees
      await cleanWorktrees(repoPath).catch(() => {});
      logEvent({ functionArea: 'project', level: 'info', operation: 'cleanup-worktrees', message: `Cleaned worktrees for ${name}` }).catch(() => {});
    } catch {}
    await removeProject(name);
    setRemoving(null);
    setWarning(null);
    setLangStats((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: 18 }}>Projects</h2>
        <button
          onClick={handleAddProject}
          style={{
            background: '#238636',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Project
        </button>
      </div>

      {error && (
        <div style={{
          background: '#3d1f1f',
          border: '1px solid #6e3030',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          color: '#f88',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {addError && (
        <div style={{
          background: '#3d1f1f',
          border: '1px solid #6e3030',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          color: '#f88',
          fontSize: 13,
        }}>
          {addError}
        </div>
      )}

      {isLoading && (
        <div style={{ color: '#8b949e', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Loading projects...
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div style={{
          color: '#8b949e',
          fontSize: 14,
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed #30363d',
          borderRadius: 8,
        }}>
          No projects yet. Click "+ Project" to add a git repository.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {projects.map((project) => {
          const isConfirmingRemove = removing === project.name;
          const stats = langStats[project.name] || [];

          return (
            <div
              key={project.name}
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#e0e0e0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {project.name}
                    </span>
                    {project.currentBranch && (
                      <span style={{
                        fontSize: 11,
                        color: '#8b949e',
                        background: '#21262d',
                        padding: '1px 6px',
                        borderRadius: 10,
                        flexShrink: 0,
                      }}>
                        {project.currentBranch}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: '#6e7681',
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {project.repoPath}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(project.name)}
                  disabled={isChecking}
                  style={{
                    background: isConfirmingRemove ? '#da3633' : 'transparent',
                    color: isConfirmingRemove ? '#fff' : '#6e7681',
                    border: isConfirmingRemove ? '1px solid #da3633' : '1px solid transparent',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {isChecking && removing === project.name ? '...' : isConfirmingRemove ? 'Confirm' : '\u00d7'}
                </button>
              </div>

              {stats.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    display: 'flex',
                    height: 8,
                    borderRadius: 4,
                    overflow: 'hidden',
                    gap: 1,
                  }}>
                    {stats.filter((s) => s.percentage >= 0.5).map((stat) => (
                      <div
                        key={stat.language}
                        title={`${stat.language}: ${stat.percentage.toFixed(1)}%`}
                        style={{
                          width: `${stat.percentage}%`,
                          backgroundColor: stat.color,
                          minWidth: 3,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                    marginTop: 6,
                  }}>
                    {stats.filter((s) => s.percentage >= 1).map((stat) => (
                      <span
                        key={stat.language}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: stat.color,
                          display: 'inline-block',
                          flexShrink: 0,
                        }} />
                        <span style={{ color: stat.color, fontWeight: 500 }}>
                          {stat.language}
                        </span>
                        <span style={{ color: '#6e7681' }}>
                          {stat.percentage.toFixed(1)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Warning modal for worktrees with unsaved work */}
      {warning && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#161b22',
            border: '1px solid #da3633',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>&#9888;</span>
              <h3 style={{ margin: 0, color: '#f85149', fontSize: 16 }}>
                Worktrees Have Unsaved Work
              </h3>
            </div>

            <p style={{ color: '#adbac7', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
              Removing <strong style={{ color: '#e0e0e0' }}>{warning.projectName}</strong> will
              delete {warning.sessions.length} worktree{warning.sessions.length > 1 ? 's' : ''}.
              The following have work that may be lost:
            </p>

            <div style={{
              background: '#0d1117',
              border: '1px solid #21262d',
              borderRadius: 6,
              padding: 8,
              marginBottom: 16,
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {warning.sessions.map(({ session, uncommittedChanges, branchNotOnRemote }) => (
                <div key={session.sessionId} style={{
                  padding: '6px 8px',
                  fontSize: 12,
                  borderBottom: '1px solid #21262d',
                }}>
                  <div style={{ color: '#d2a8ff', fontFamily: "'Cascadia Code', monospace", marginBottom: 4 }}>
                    {session.branchName}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {uncommittedChanges > 0 && (
                      <span style={{ color: '#d29922', fontSize: 11 }}>
                        {uncommittedChanges} uncommitted change{uncommittedChanges > 1 ? 's' : ''}
                      </span>
                    )}
                    {branchNotOnRemote && (
                      <span style={{ color: '#f85149', fontSize: 11 }}>
                        branch not pushed to remote
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ color: '#8b949e', fontSize: 12, margin: '0 0 16px' }}>
              Consider committing and pushing changes before removing this project.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setWarning(null); setRemoving(null); }}
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => doRemove(warning.projectName, warning.repoPath)}
                style={{
                  background: '#da3633',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remove Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
