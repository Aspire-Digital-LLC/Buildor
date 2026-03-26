import type { FileEntry } from '@/types';
import { useFileTreeStore } from '@/stores';
import { FileTreeItem } from './FileTreeItem';

interface FileTreeProps {
  entries: FileEntry[];
  depth?: number;
}

export function FileTree({ entries, depth = 0 }: FileTreeProps) {
  const { expandedDirs, selectedFilePath, toggleDirectory, selectFile } = useFileTreeStore();

  return (
    <>
      {entries.map((entry) => {
        const isExpanded = expandedDirs.has(entry.path);
        const isSelected = selectedFilePath === entry.path;

        return (
          <div key={entry.path}>
            <FileTreeItem
              entry={entry}
              depth={depth}
              isExpanded={isExpanded}
              isSelected={isSelected}
              onToggleDir={toggleDirectory}
              onSelectFile={selectFile}
            />
            {entry.isDirectory && isExpanded && entry.children && (
              <FileTree entries={entry.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}
