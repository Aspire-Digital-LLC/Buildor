import { useState } from 'react';
import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

export function SkillEditorFiles() {
  const { editor, updateField } = useSkillBuilderStore();
  const [activeFile, setActiveFile] = useState<number | null>(null);
  const [newFileName, setNewFileName] = useState('');

  const addFile = () => {
    const name = newFileName.trim();
    if (!name || editor.supportingFiles.some((f) => f.name === name)) return;
    updateField('supportingFiles', [...editor.supportingFiles, { name, content: '' }]);
    setNewFileName('');
    setActiveFile(editor.supportingFiles.length);
  };

  const removeFile = (index: number) => {
    updateField('supportingFiles', editor.supportingFiles.filter((_, i) => i !== index));
    if (activeFile === index) setActiveFile(null);
    else if (activeFile !== null && activeFile > index) setActiveFile(activeFile - 1);
  };

  const updateContent = (index: number, content: string) => {
    const next = [...editor.supportingFiles];
    next[index] = { ...next[index], content };
    updateField('supportingFiles', next);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 4,
    color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', flex: 1,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* File list + add */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="reference.md"
            onKeyDown={(e) => { if (e.key === 'Enter') addFile(); }}
            style={inputStyle}
          />
          <button onClick={addFile} disabled={!newFileName.trim()} style={{
            background: '#238636', border: 'none', color: '#fff', borderRadius: 4,
            padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            opacity: newFileName.trim() ? 1 : 0.5,
          }}>Add</button>
        </div>

        {editor.supportingFiles.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            No supporting files. Add reference.md, examples.md, etc.
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {editor.supportingFiles.map((f, i) => (
            <div
              key={f.name}
              onClick={() => setActiveFile(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                background: activeFile === i ? 'var(--bg-active)' : 'var(--bg-primary)',
                border: `1px solid ${activeFile === i ? 'var(--accent-secondary)' : 'var(--border-secondary)'}`,
                borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)',
              }}
            >
              {f.name}
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 10, padding: 0, marginLeft: 4 }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* File editor */}
      {activeFile !== null && editor.supportingFiles[activeFile] && (
        <textarea
          value={editor.supportingFiles[activeFile].content}
          onChange={(e) => updateContent(activeFile, e.target.value)}
          style={{
            flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: 'none', outline: 'none', padding: 16, fontSize: 13,
            fontFamily: "'Cascadia Code', monospace", lineHeight: 1.6, resize: 'none',
            width: '100%', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}
