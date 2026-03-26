interface UntrackedListProps {
  files: string[];
  onStage: (path: string) => void;
  onStageAll: () => void;
  onClickFile?: (path: string) => void;
}

export function UntrackedList({ files, onStage, onStageAll, onClickFile }: UntrackedListProps) {
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
