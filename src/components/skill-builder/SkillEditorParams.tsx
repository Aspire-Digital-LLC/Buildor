import { useSkillBuilderStore } from '@/stores/skillBuilderStore';
import type { SkillParam } from '@/types/skill';

const PARAM_TYPES: SkillParam['type'][] = ['text', 'number', 'boolean', 'select'];

function ParamCard({ param, index, onChange, onRemove }: {
  param: SkillParam;
  index: number;
  onChange: (updated: SkillParam) => void;
  onRemove: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 4,
    color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 2 };

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
      borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Param {index + 1}</span>
        <button onClick={onRemove} style={{ background: 'transparent', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: 12 }}>Remove</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={labelStyle}>Name</div>
          <input value={param.name} onChange={(e) => onChange({ ...param, name: e.target.value })} placeholder="param-name" style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Type</div>
          <select value={param.type} onChange={(e) => onChange({ ...param, type: e.target.value as SkillParam['type'] })} style={{ ...inputStyle, cursor: 'pointer' }}>
            {PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div style={labelStyle}>Description</div>
        <input value={param.description || ''} onChange={(e) => onChange({ ...param, description: e.target.value })} placeholder="Shown in the params modal" style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={labelStyle}>Placeholder</div>
          <input value={param.placeholder || ''} onChange={(e) => onChange({ ...param, placeholder: e.target.value })} placeholder="Hint text" style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Default</div>
          <input value={String(param.default ?? '')} onChange={(e) => onChange({ ...param, default: e.target.value || undefined })} placeholder="Default value" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={param.required} onChange={(e) => onChange({ ...param, required: e.target.checked })} style={{ accentColor: 'var(--accent-primary)' }} />
          Required
        </label>
      </div>

      {param.type === 'select' && (
        <div>
          <div style={labelStyle}>Options (comma-separated)</div>
          <input
            value={(param.options || []).join(', ')}
            onChange={(e) => onChange({ ...param, options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
            placeholder="option1, option2, option3"
            style={inputStyle}
          />
        </div>
      )}
    </div>
  );
}

export function SkillEditorParams() {
  const { editor, updateField } = useSkillBuilderStore();

  const addParam = () => {
    updateField('params', [...editor.params, { name: '', type: 'text', required: false }]);
  };

  const updateParam = (index: number, updated: SkillParam) => {
    const next = [...editor.params];
    next[index] = updated;
    updateField('params', next);
  };

  const removeParam = (index: number) => {
    updateField('params', editor.params.filter((_, i) => i !== index));
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Parameters</span>
        <button onClick={addParam} style={{
          background: '#238636', border: 'none', color: '#fff', borderRadius: 4,
          padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>+ Add</button>
      </div>

      {editor.params.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>
          No parameters. Click "+ Add" to create one.
        </div>
      )}

      {editor.params.map((param, i) => (
        <ParamCard key={i} param={param} index={i} onChange={(u) => updateParam(i, u)} onRemove={() => removeParam(i)} />
      ))}
    </div>
  );
}
