import { DiffEditor } from '@monaco-editor/react';
import { useGitStore } from '@/stores';

export function DiffViewer() {
  const { diff, closeDiff } = useGitStore();

  if (!diff) return null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 36,
        background: '#1c2128',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 12,
        flexShrink: 0,
      }}>
        <span style={{ color: '#e0e0e0', fontFamily: "'Cascadia Code', 'Consolas', monospace" }}>
          {diff.filePath}
          <span style={{ color: '#6e7681', marginLeft: 8 }}>
            ({diff.staged ? 'staged' : 'unstaged'})
          </span>
        </span>
        <button
          onClick={closeDiff}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: 16,
            padding: '2px 6px',
          }}
        >
          ×
        </button>
      </div>
      <DiffEditor
        height="100%"
        original={diff.before}
        modified={diff.after}
        language={diff.language}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
