import { useState } from 'react';
import type { SkillParam } from '@/types/skill';

interface SkillParamsModalProps {
  skillName: string;
  params: SkillParam[];
  onConfirm: (values: Record<string, string | number | boolean>) => void;
  onCancel: () => void;
}

export function SkillParamsModal({ skillName, params, onConfirm, onCancel }: SkillParamsModalProps) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    for (const p of params) {
      if (p.default !== undefined) initial[p.name] = p.default;
      else if (p.type === 'boolean') initial[p.name] = false;
      else if (p.type === 'number') initial[p.name] = 0;
      else initial[p.name] = '';
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const p of params) {
      if (p.required) {
        const v = values[p.name];
        if (v === undefined || v === '' || (p.type === 'number' && isNaN(Number(v)))) {
          errs[p.name] = 'Required';
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConfirm = () => {
    if (validate()) onConfirm(values);
  };

  const setValue = (name: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          padding: 20,
          minWidth: 320,
          maxWidth: 420,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          {skillName}
        </div>

        {params.map((p) => (
          <div key={p.name} style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}>
              {p.name}
              {p.required && <span style={{ color: '#f85149', marginLeft: 2 }}>*</span>}
              {p.description && (
                <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                  {p.description}
                </span>
              )}
            </label>

            {p.type === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!values[p.name]}
                  onChange={(e) => setValue(p.name, e.target.checked)}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                  {values[p.name] ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            ) : p.type === 'select' && p.options ? (
              <select
                value={String(values[p.name] || '')}
                onChange={(e) => setValue(p.name, e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${errors[p.name] ? '#f85149' : 'var(--border-secondary)'}`,
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: "'Cascadia Code', monospace",
                }}
              >
                <option value="">Select...</option>
                {p.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={p.type === 'number' ? 'number' : 'text'}
                value={String(values[p.name] ?? '')}
                onChange={(e) => setValue(p.name, p.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={p.placeholder || ''}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${errors[p.name] ? '#f85149' : 'var(--border-secondary)'}`,
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: "'Cascadia Code', monospace",
                  boxSizing: 'border-box',
                }}
              />
            )}

            {errors[p.name] && (
              <div style={{ fontSize: 10, color: '#f85149', marginTop: 2 }}>{errors[p.name]}</div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'var(--border-primary)',
              border: 'none',
              color: 'var(--text-secondary)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              background: '#238636',
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
