interface UntrackedListProps {
  files: string[];
  onStage: (path: string) => void;
  onStageAll: () => void;
  onClickFile?: (path: string) => void;
  onDiscard?: (path: string) => void;
}

export function UntrackedList({ files, onStage, onStageAll, onClickFile, onDiscard }: UntrackedListProps) {
  if (files.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: '#8b949e',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        <span>Untracked ({files.length})</span>
        <button
          onClick={onStageAll}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#58a6ff',
            fontSize: 11,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          Stage All
        </button>
      </div>
      {files.map((file) => (
        <div
          key={file}
          onClick={() => onClickFile?.(file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '3px 12px',
            cursor: onClickFile ? 'pointer' : 'default',
            fontSize: 13,
            color: '#adbac7',
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{
            width: 16,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#3fb950',
            marginRight: 8,
            flexShrink: 0,
          }}>
            ?
          </span>
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {file}
          </span>
          {/* Discard (delete) button */}
          {onDiscard && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDiscard(file);
              }}
              title="Delete untracked file"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f85149',
                fontSize: 13,
                cursor: 'pointer',
                padding: '0 4px',
                flexShrink: 0,
                opacity: 0.6,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          {/* Stage button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStage(file);
            }}
            title="Stage file"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: 14,
              cursor: 'pointer',
              padding: '0 4px',
              flexShrink: 0,
              opacity: 0.6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}
