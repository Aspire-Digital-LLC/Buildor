import type { FileEntry } from '@/types';
import { useFileTreeStore, useFileTreeRepoState } from '@/stores/fileTreeStore';
import { FileTreeItem } from './FileTreeItem';

interface FileTreeProps {
  entries: FileEntry[];
  rootPath: string;
  depth?: number;
}

export function FileTree({ entries, rootPath, depth = 0 }: FileTreeProps) {
  const { expandedDirs, selectedFilePath } = useFileTreeRepoState(rootPath);
  const { toggleDirectory, selectFile } = useFileTreeStore();

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
              onToggleDir={(path) => toggleDirectory(rootPath, path)}
              onSelectFile={(path) => selectFile(rootPath, path)}
            />
            {entry.isDirectory && isExpanded && entry.children && (
              <FileTree entries={entry.children} rootPath={rootPath} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}
