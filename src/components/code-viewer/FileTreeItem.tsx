import type { FileEntry } from '@/types';

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}

export function FileTreeItem({
  entry,
  depth,
  isExpanded,
  isSelected,
  onToggleDir,
  onSelectFile,
}: FileTreeItemProps) {
  const handleClick = () => {
    if (entry.isDirectory) {
      onToggleDir(entry.path);
    } else {
      onSelectFile(entry.path);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px 8px',
        paddingLeft: depth * 16 + 8,
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-active)' : 'transparent',
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderLeft: isSelected ? '2px solid var(--accent-secondary)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ marginRight: 6, fontSize: 11, width: 14, textAlign: 'center', flexShrink: 0 }}>
        {entry.isDirectory ? (isExpanded ? '\u25BE' : '\u25B8') : ' '}
      </span>
      <span style={{ marginRight: 6, fontSize: 14, flexShrink: 0 }}>
        {entry.isDirectory ? (isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1') : '\uD83D\uDCC4'}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {entry.name}
      </span>
    </div>
  );
}
