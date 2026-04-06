import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

export function SkillEditorPrompt() {
  const { editor, updateField } = useSkillBuilderStore();

  const paramNames = editor.params.map((p) => p.name).filter(Boolean);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      {paramNames.length > 0 && (
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--border-primary)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Insert param:</span>
          {paramNames.map((name) => (
            <button
              key={name}
              onClick={() => updateField('promptContent', editor.promptContent + `{{${name}}}`)}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
                borderRadius: 3, padding: '2px 6px', fontSize: 11, color: 'var(--accent-primary)',
                cursor: 'pointer', fontFamily: "'Cascadia Code', monospace",
              }}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={editor.promptContent}
        onChange={(e) => updateField('promptContent', e.target.value)}
        placeholder="# Skill Prompt&#10;&#10;Write your prompt template here. Use {{param-name}} for parameter substitution.&#10;Use !`command` for inline shell commands."
        style={{
          flex: 1,
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: 'none',
          outline: 'none',
          padding: 16,
          fontSize: 13,
          fontFamily: "'Cascadia Code', monospace",
          lineHeight: 1.6,
          resize: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
