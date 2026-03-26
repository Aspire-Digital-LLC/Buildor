import type { FileChange } from '@/types';

interface ChangeListProps {
  title: string;
  files: FileChange[];
  type: 'staged' | 'unstaged';
  onClickFile: (path: string, staged: boolean) => void;
  onAction: (path: string) => void;
  actionLabel: string;
  onBulkAction?: () => void;
  bulkLabel?: string;
}

const statusColors: Record<string, string> = {
  added: '#3fb950',
  modified: '#d29922',
  deleted: '#f85149',
  renamed: '#58a6ff',
  copied: '#58a6ff',
  unmerged: '#f85149',
};

const statusLetters: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  unmerged: 'U',
};

export function ChangeList({
  title,
  files,
  type,
  onClickFile,
  onAction,
  actionLabel,
  onBulkAction,
  bulkLabel,
}: ChangeListProps) {
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
        <span>{title} ({files.length})</span>
        {onBulkAction && (
          <button
            onClick={onBulkAction}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#58a6ff',
              fontSize: 11,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            {bulkLabel}
          </button>
        )}
      </div>
      {files.map((file) => (
        <div
          key={file.path + type}
          onClick={() => onClickFile(file.path, type === 'staged')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '3px 12px',
            cursor: 'pointer',
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
            color: statusColors[file.status] || '#8b949e',
            marginRight: 8,
            flexShrink: 0,
          }}>
            {statusLetters[file.status] || '?'}
          </span>
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {file.path}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction(file.path);
            }}
            title={actionLabel}
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
            {type === 'unstaged' ? '+' : '−'}
          </button>
        </div>
      ))}
    </div>
  );
}
