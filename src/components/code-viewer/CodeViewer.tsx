import { useEffect } from 'react';
import { useProjectStore, useFileTreeStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { FileTree } from './FileTree';
import { EditorPanel } from './EditorPanel';

export function CodeViewer() {
  const { projectName } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;
  const { tree, isLoadingTree, loadTree, clearSelection } = useFileTreeStore();

  useEffect(() => {
    if (activeProject) {
      loadTree(activeProject.repoPath);
      clearSelection();
    }
  }, [activeProject?.repoPath]);

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
        Select a project to browse code
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* File Tree Sidebar */}
      <div style={{
        width: 260,
        minWidth: 180,
        borderRight: '1px solid #21262d',
        background: '#0d1117',
        overflow: 'auto',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#8b949e',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid #21262d',
        }}>
          {activeProject.name}
        </div>
        {isLoadingTree ? (
          <div style={{ padding: 16, color: '#6e7681', fontSize: 13 }}>
            Loading file tree...
          </div>
        ) : (
          <FileTree entries={tree} />
        )}
      </div>

      {/* Editor */}
      <EditorPanel />
    </div>
  );
}
