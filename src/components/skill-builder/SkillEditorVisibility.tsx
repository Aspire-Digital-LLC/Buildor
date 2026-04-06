import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

export function SkillEditorVisibility() {
  const { editor, updateVisibility } = useSkillBuilderStore();
  const vis = editor.visibility;

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6,
    color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={vis.autoLoad !== false}
            onChange={(e) => updateVisibility({ autoLoad: e.target.checked })}
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          Auto-discoverable (eyeball mode)
        </label>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, paddingLeft: 24 }}>
          When on, Claude can auto-discover this skill via its description.
        </div>
      </div>

      <div>
        <div style={labelStyle}>Path Patterns</div>
        <input
          value={(vis.paths || []).join(', ')}
          onChange={(e) => updateVisibility({ paths: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) })}
          placeholder="src/**/*.ts, **/*.rs"
          style={inputStyle}
        />
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          Comma-separated globs. Skill only appears when working with matching files. Empty = always visible.
        </div>
      </div>
    </div>
  );
}
