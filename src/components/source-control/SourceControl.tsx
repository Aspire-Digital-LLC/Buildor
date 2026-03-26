import { useEffect, useCallback } from 'react';
import { useProjectStore, useGitStore } from '@/stores';
import { ChangeList } from './ChangeList';
import { UntrackedList } from './UntrackedList';
import { DiffViewer } from './DiffViewer';
import { GitMenu } from './GitMenu';

export function SourceControl() {
  const { activeProject } = useProjectStore();
  const {
    status,
    diff,
    isLoading,
    error,
    commitMessage,
    refreshStatus,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    commit,
    push,
    pull,
    viewDiff,
    setCommitMessage,
  } = useGitStore();

  const repoPath = activeProject?.repoPath;

  useEffect(() => {
    if (repoPath) {
      refreshStatus(repoPath);
    }
  }, [repoPath]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!repoPath) return;
    const interval = setInterval(() => refreshStatus(repoPath), 5000);
    return () => clearInterval(interval);
  }, [repoPath]);

  const handleCommit = useCallback(async () => {
    if (!repoPath) return;
    try {
      await commit(repoPath);
    } catch {
      // error is set in store
    }
  }, [repoPath, commit]);

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
        Select a project to view source control
      </div>
    );
  }

  const hasChanges = status && (
    status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    status.untracked.length > 0
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left panel — changes + commit */}
      <div style={{
        width: diff ? 320 : '100%',
        minWidth: 280,
        borderRight: diff ? '1px solid #21262d' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Header with branch info */}
        <div style={{
          padding: '12px 12px 8px',
          borderBottom: '1px solid #21262d',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
                Source Control
              </span>
              {status && (
                <span style={{
                  fontSize: 11,
                  color: '#8b949e',
                  background: '#21262d',
                  padding: '1px 6px',
                  borderRadius: 10,
                }}>
                  {status.branch}
                  {status.ahead > 0 && ` ↑${status.ahead}`}
                  {status.behind > 0 && ` ↓${status.behind}`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => repoPath && pull(repoPath)}
                title="Pull"
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
                Pull
              </button>
              <button
                onClick={() => repoPath && push(repoPath)}
                title="Push"
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Push
              </button>
              <button
                onClick={() => repoPath && refreshStatus(repoPath)}
                title="Refresh"
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
              <GitMenu />
            </div>
          </div>

          {/* Commit input */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
              style={{
                flex: 1,
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 4,
                color: '#e0e0e0',
                padding: '6px 10px',
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || !status?.staged.length}
              style={{
                background: commitMessage.trim() && status?.staged.length ? '#238636' : '#21262d',
                color: commitMessage.trim() && status?.staged.length ? '#fff' : '#484f58',
                border: 'none',
                borderRadius: 4,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: commitMessage.trim() && status?.staged.length ? 'pointer' : 'default',
              }}
            >
              Commit
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: '#3d1f1f',
            borderBottom: '1px solid #6e3030',
            padding: '6px 12px',
            color: '#f88',
            fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Changes list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading && !status && (
            <div style={{ padding: 16, color: '#6e7681', fontSize: 13, textAlign: 'center' }}>
              Loading...
            </div>
          )}

          {status && !hasChanges && (
            <div style={{
              padding: '32px 16px',
              color: '#6e7681',
              fontSize: 13,
              textAlign: 'center',
            }}>
              No changes detected
            </div>
          )}

          {status && (
            <>
              <ChangeList
                title="Staged Changes"
                files={status.staged}
                type="staged"
                onClickFile={(path, staged) => repoPath && viewDiff(repoPath, path, staged)}
                onAction={(path) => repoPath && unstageFiles(repoPath, [path])}
                actionLabel="Unstage"
                onBulkAction={() => repoPath && unstageAll(repoPath)}
                bulkLabel="Unstage All"
              />
              <ChangeList
                title="Changes"
                files={status.unstaged}
                type="unstaged"
                onClickFile={(path, staged) => repoPath && viewDiff(repoPath, path, staged)}
                onAction={(path) => repoPath && stageFiles(repoPath, [path])}
                actionLabel="Stage"
                onBulkAction={() => repoPath && stageAll(repoPath)}
                bulkLabel="Stage All"
              />
              <UntrackedList
                files={status.untracked}
                onStage={(path) => repoPath && stageFiles(repoPath, [path])}
                onStageAll={() => repoPath && stageAll(repoPath)}
              />
            </>
          )}
        </div>
      </div>

      {/* Right panel — diff viewer */}
      {diff && <DiffViewer />}
    </div>
  );
}
