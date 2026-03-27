import { useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useFileTreeStore } from '@/stores';
import { useProjectStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import { writeFileContent } from '@/utils/commands/filesystem';
import { logEvent } from '@/utils/commands/logging';

export function EditorPanel() {
  const { selectedFilePath, fileContent, fileLanguage, isLoadingFile, selectFile } = useFileTreeStore();
  const { projectName } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleSave = useCallback(async () => {
    if (!editorRef.current || !selectedFilePath) return;
    const newContent = editorRef.current.getValue();
    setIsSaving(true);
    try {
      await writeFileContent(selectedFilePath, newContent);
      logEvent({
        repo: activeProject?.repoPath,
        functionArea: 'code-viewer',
        level: 'info',
        operation: 'save-file',
        message: `Saved: ${selectedFilePath}`,
      }).catch(() => {});
      // Reload the file to sync store state
      await selectFile(selectedFilePath);
      setIsEditing(false);
    } catch (e) {
      logEvent({
        repo: activeProject?.repoPath,
        functionArea: 'code-viewer',
        level: 'error',
        operation: 'save-file',
        message: `Failed to save: ${String(e)}`,
      }).catch(() => {});
    }
    setIsSaving(false);
  }, [selectedFilePath, activeProject]);

  const handleCancel = useCallback(() => {
    // Reset editor to original content
    if (editorRef.current && fileContent !== null) {
      editorRef.current.setValue(fileContent);
    }
    setIsEditing(false);
  }, [fileContent]);

  if (!selectedFilePath) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
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
      {/* Breadcrumb + actions */}
      <div style={{
        height: 36,
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 12,
        color: 'var(--text-secondary)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        flexShrink: 0,
      }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {breadcrumbParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 4px', color: 'var(--text-tertiary)' }}>/</span>}
              <span style={{
                color: i === breadcrumbParts.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                {part}
              </span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              title="Edit file"
              style={{
                background: 'var(--border-primary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  background: '#238636',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  cursor: isSaving ? 'default' : 'pointer',
                  fontWeight: 600,
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  background: 'var(--border-primary)',
                  border: '1px solid var(--border-secondary)',
                  color: 'var(--text-primary)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editing indicator bar */}
      {isEditing && (
        <div style={{
          height: 2,
          background: '#d29922',
          flexShrink: 0,
        }} />
      )}

      {/* Editor */}
      {isLoadingFile ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}>
          Loading...
        </div>
      ) : (
        <Editor
          height="100%"
          language={fileLanguage}
          value={fileContent || ''}
          theme="vs-dark"
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            readOnly: !isEditing,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 13,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            automaticLayout: true,
            cursorStyle: isEditing ? 'line' : 'line-thin',
            cursorBlinking: isEditing ? 'blink' : 'solid',
          }}
        />
      )}
    </div>
  );
}
