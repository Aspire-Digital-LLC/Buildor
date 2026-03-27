import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useGitStore, useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { gitStage, gitUnstage, gitDiscardFile, gitDeleteUntrackedFile } from '@/utils/commands/git';

export function DiffViewer() {
  const { diff, closeDiff, refreshStatus } = useGitStore();
  const { projectName, browsePath } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;
  const repoPath = browsePath || activeProject?.repoPath;

  if (!diff) return null;

  const isUntracked = !diff.staged && diff.before === '';

  const handleStageOrUnstage = async () => {
    if (!repoPath) return;
    if (diff.staged) {
      await gitUnstage(repoPath, [diff.filePath]);
    } else {
      await gitStage(repoPath, [diff.filePath]);
    }
    await refreshStatus(repoPath);
    closeDiff();
  };

  const handleDiscard = async () => {
    if (!repoPath || diff.staged) return;
    if (isUntracked) {
      await gitDeleteUntrackedFile(repoPath, diff.filePath);
    } else {
      await gitDiscardFile(repoPath, diff.filePath);
    }
    await refreshStatus(repoPath);
    closeDiff();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        height: 40,
        background: '#1c2128',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 13,
        flexShrink: 0,
      }}>
        <span style={{ color: '#e0e0e0', fontFamily: "'Cascadia Code', 'Consolas', monospace" }}>
          {diff.filePath}
          <span style={{
            color: diff.staged ? '#3fb950' : '#d29922',
            marginLeft: 8,
            fontSize: 11,
            background: '#21262d',
            padding: '1px 6px',
            borderRadius: 10,
          }}>
            {diff.staged ? 'staged' : 'unstaged'}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Stage/Unstage button */}
          <button
            onClick={handleStageOrUnstage}
            title={diff.staged ? 'Unstage this file' : 'Stage this file'}
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {diff.staged ? 'Unstage' : 'Stage'}
          </button>
          {/* Discard button (only for unstaged) */}
          {!diff.staged && (
            <button
              onClick={handleDiscard}
              title="Discard changes"
              style={{
                background: '#21262d',
                border: '1px solid #da3633',
                color: '#f85149',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Discard
            </button>
          )}
          {/* Close button */}
          <button
            onClick={closeDiff}
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              color: '#8b949e',
              cursor: 'pointer',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Diff Editor */}
      <DiffEditor
        height="100%"
        original={diff.before}
        modified={diff.after}
        language={diff.language}
        theme="vs-dark"
        onMount={(_editor: editor.IStandaloneDiffEditor) => {
          // Add tooltips to revert icons after Monaco renders
          const container = _editor.getContainerDomNode();
          const observer = new MutationObserver(() => {
            container.querySelectorAll('.codicon-arrow-right, .revert-button').forEach((el) => {
              if (!el.getAttribute('title')) {
                el.setAttribute('title', 'Revert this change');
              }
            });
          });
          observer.observe(container, { childList: true, subtree: true });
        }}
        options={{
          readOnly: false,
          renderSideBySide: true,
          enableSplitViewResizing: true,
          // Character-level inline diff highlighting
          renderIndicators: true,
          renderMarginRevertIcon: true,
          // Minimap with change indicators
          minimap: { enabled: true },
          // Editor options
          scrollBeyondLastLine: false,
          fontSize: 13,
          automaticLayout: true,
          glyphMargin: true,
          folding: true,
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          // Overview ruler (right scrollbar) shows colored markers for changes
          overviewRulerBorder: false,
        }}
      />
    </div>
  );
}
