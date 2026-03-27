import { useState, useEffect, useCallback } from 'react';
import { useProjectStore, useFileTreeStore, useTabStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { FileTree } from './FileTree';
import { EditorPanel } from './EditorPanel';
import { BranchSwitcher } from './BranchSwitcher';
import { logEvent } from '@/utils/commands/logging';
import { buildorEvents } from '@/utils/buildorEvents';

export function CodeViewer() {
  const { projectName, browsePath, browseBranch, browseIsWorktree } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;
  const { tree, isLoadingTree, loadTree, clearSelection } = useFileTreeStore();
  const updateCheckedOutBranch = useTabStore((s) => s.updateCheckedOutBranch);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);

  const rootPath = browsePath || activeProject?.repoPath;

  useEffect(() => {
    if (rootPath) {
      loadTree(rootPath);
      clearSelection();
    }
  }, [rootPath]);

  const handleBranchSwitched = useCallback((newBranch: string) => {
    if (activeProject && rootPath) {
      // Update all tabs pointing to this checked-out branch
      updateCheckedOutBranch(activeProject.name, rootPath, newBranch);
      // Refresh the project store so sidebar/dropdowns show updated branch
      useProjectStore.getState().refreshCurrentBranch(activeProject.name);
      // Reload the file tree for the new branch
      loadTree(rootPath);
      clearSelection();
      // Signal sidebar to refresh change counts immediately
      buildorEvents.emit('branch-switched', { projectName: activeProject.name, branch: newBranch });
      logEvent({
        repo: rootPath,
        functionArea: 'code-viewer',
        level: 'info',
        operation: 'switch-branch',
        message: `Switched ${activeProject.name} to ${newBranch}`,
      }).catch(() => {});
    }
  }, [activeProject, rootPath, updateCheckedOutBranch, loadTree, clearSelection]);

  if (!activeProject) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        fontSize: 14,
      }}>
        Select a project to browse code
      </div>
    );
  }

  const branchName = browseBranch || activeProject.currentBranch || 'main';
  const isWorktree = browseIsWorktree ?? false;
  const canSwitchBranch = !isWorktree;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* File Tree Sidebar */}
      <div style={{
        width: 260,
        minWidth: 180,
        borderRight: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border-primary)',
        }}>
          {activeProject.name}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoadingTree ? (
            <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading file tree...
            </div>
          ) : (
            <FileTree entries={tree} />
          )}
        </div>

        {/* Branch status bar — clickable for checked-out branches */}
        <div
          onClick={canSwitchBranch ? () => setShowBranchSwitcher((v) => !v) : undefined}
          style={{
            padding: '6px 10px',
            borderTop: '1px solid var(--border-primary)',
            background: showBranchSwitcher ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            cursor: canSwitchBranch ? 'pointer' : 'default',
          }}
          onMouseEnter={(e) => { if (canSwitchBranch) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={(e) => { if (canSwitchBranch && !showBranchSwitcher) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isWorktree ? '#d2a8ff' : '#58a6ff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isWorktree ? (
              <>
                <path d="M6 3v18" />
                <path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
              </>
            ) : (
              <>
                <path d="M6 3v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
              </>
            )}
          </svg>
          <span style={{
            fontSize: 11,
            color: isWorktree ? '#d2a8ff' : '#58a6ff',
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {branchName}
          </span>
          <span style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            background: 'var(--border-primary)',
            padding: '1px 5px',
            borderRadius: 4,
            flexShrink: 0,
            textTransform: 'uppercase',
            fontWeight: 600,
            letterSpacing: '0.3px',
          }}>
            {isWorktree ? 'worktree' : 'checked out'}
          </span>
          {canSwitchBranch && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          )}
        </div>

        {/* Branch switcher slide-up panel */}
        {showBranchSwitcher && rootPath && (
          <BranchSwitcher
            repoPath={rootPath}
            currentBranch={branchName}
            projectName={activeProject.name}
            onBranchSwitched={handleBranchSwitched}
            onClose={() => setShowBranchSwitcher(false)}
          />
        )}
      </div>

      {/* Editor */}
      <EditorPanel />
    </div>
  );
}
