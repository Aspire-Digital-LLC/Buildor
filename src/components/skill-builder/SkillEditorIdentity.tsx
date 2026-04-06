import { useSkillBuilderStore } from '@/stores/skillBuilderStore';
import { useProjectStore } from '@/stores';

export function SkillEditorIdentity() {
  const { editor, updateField } = useSkillBuilderStore();
  const { projects } = useProjectStore();

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6,
    color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {/* Name */}
      <div>
        <div style={labelStyle}>Name</div>
        <input
          type="text"
          value={editor.name}
          onChange={(e) => updateField('name', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          placeholder="my-skill-name"
          style={inputStyle}
        />
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Lowercase + hyphens only. Matches the directory name.</div>
      </div>

      {/* Description */}
      <div>
        <div style={labelStyle}>Description (trigger-oriented)</div>
        <textarea
          value={editor.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder='Use when the user asks to... Applies [methodology].'
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          maxLength={250}
        />
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {editor.description.length}/250 — Lead with user intent phrases for eyeball activation.
        </div>
      </div>

      {/* Tags */}
      <div>
        <div style={labelStyle}>Tags</div>
        <input
          type="text"
          value={editor.tags.join(', ')}
          onChange={(e) => updateField('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
          placeholder="review, quality, refactor"
          style={inputStyle}
        />
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Comma-separated categories for search/filtering.</div>
      </div>

      {/* Shell */}
      <div>
        <div style={labelStyle}>Shell</div>
        <select
          value={editor.shell}
          onChange={(e) => updateField('shell', e.target.value as 'bash' | 'powershell')}
          style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 140 }}
        >
          <option value="bash">bash</option>
          <option value="powershell">powershell</option>
        </select>
      </div>

      {/* Scope */}
      <div>
        <div style={labelStyle}>Scope</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: editor.scope === 'general' ? 'var(--bg-active)' : 'var(--bg-primary)',
            border: `1px solid ${editor.scope === 'general' ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            <input type="radio" checked={editor.scope === 'general'} onChange={() => updateField('scope', 'general')} style={{ accentColor: 'var(--accent-primary)' }} />
            General
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: editor.scope === 'project' ? 'var(--bg-active)' : 'var(--bg-primary)',
            border: `1px solid ${editor.scope === 'project' ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            <input type="radio" checked={editor.scope === 'project'} onChange={() => updateField('scope', 'project')} style={{ accentColor: 'var(--accent-primary)' }} />
            Project-Specific
          </label>
        </div>
      </div>

      {/* Projects multi-select (only when scope=project) */}
      {editor.scope === 'project' && (
        <div>
          <div style={labelStyle}>Projects</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {projects.map((p) => {
              const checked = editor.projects.includes(p.name);
              return (
                <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? editor.projects.filter((n) => n !== p.name)
                        : [...editor.projects, p.name];
                      updateField('projects', next);
                    }}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  {p.name}
                </label>
              );
            })}
            {projects.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No projects configured.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
