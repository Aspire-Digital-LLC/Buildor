import Editor from '@monaco-editor/react';
import { useFileTreeStore } from '@/stores';
import { useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';

export function EditorPanel() {
  const { selectedFilePath, fileContent, fileLanguage, isLoadingFile } = useFileTreeStore();
  const { projectName } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;

  if (!selectedFilePath) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6e7681',
        fontSize: 14,
      }}>
        Select a file to view
      </div>
    );
  }

  // Compute relative path for breadcrumb
  let relativePath = selectedFilePath;
  if (activeProject) {
    const root = activeProject.repoPath.replace(/\\/g, '/');
    if (relativePath.startsWith(root)) {
      relativePath = relativePath.slice(root.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    }
  }

  const breadcrumbParts = relativePath.split('/');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Breadcrumb */}
      <div style={{
        height: 32,
        background: '#1c2128',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        fontSize: 12,
        color: '#8b949e',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      }}>
        {breadcrumbParts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span style={{ margin: '0 4px', color: '#484f58' }}>/</span>}
            <span style={{
              color: i === breadcrumbParts.length - 1 ? '#e0e0e0' : '#8b949e',
            }}>
              {part}
            </span>
          </span>
        ))}
      </div>

      {/* Editor */}
      {isLoadingFile ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6e7681',
        }}>
          Loading...
        </div>
      ) : (
        <Editor
          height="100%"
          language={fileLanguage}
          value={fileContent || ''}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 13,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            automaticLayout: true,
          }}
        />
      )}
    </div>
  );
}
