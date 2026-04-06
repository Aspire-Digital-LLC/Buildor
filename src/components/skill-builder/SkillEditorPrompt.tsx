import { useSkillBuilderStore } from '@/stores/skillBuilderStore';
import { FieldReviewCard } from './FieldReviewCard';
import { PendingUpdateCard } from './PendingUpdateCard';

interface SkillEditorPromptProps {
  onDiscuss: (field: string, message: string) => void;
}

export function SkillEditorPrompt({ onDiscuss }: SkillEditorPromptProps) {
  const { editor, updateField } = useSkillBuilderStore();

  const paramNames = editor.params.map((p) => p.name).filter(Boolean);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border-primary)',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
          Prompt <span style={{ color: '#f85149' }}>*</span>
        </span>
        {paramNames.length > 0 && (
          <>
            <span style={{ color: 'var(--border-secondary)' }}>|</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Insert:</span>
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
          </>
        )}
      </div>

      {/* Pending update + review card for prompt */}
      <PendingUpdateCard field="promptContent" />
      <FieldReviewCard field="promptContent" onDiscuss={onDiscuss} />

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
