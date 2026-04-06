import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

export function SkillEditorHealth() {
  const { editor, updateHealth } = useSkillBuilderStore();
  const health = editor.health;

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6,
    color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', width: 100, boxSizing: 'border-box',
  };

  const fields: { key: keyof typeof health; label: string; hint: string }[] = [
    { key: 'idleSeconds', label: 'Idle Timeout (s)', hint: 'Max seconds with no output before warning' },
    { key: 'stallSeconds', label: 'Stall Timeout (s)', hint: 'Max seconds repeating same output' },
    { key: 'distressSeconds', label: 'Distress Timeout (s)', hint: 'Max total seconds before escalation' },
    { key: 'loopDetectionWindow', label: 'Loop Window', hint: 'Number of recent outputs to check for loops' },
    { key: 'loopThreshold', label: 'Loop Threshold', hint: 'Repeated outputs within window to flag a loop' },
    { key: 'errorThreshold', label: 'Error Threshold', hint: 'Consecutive errors before escalation' },
  ];

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        Health monitoring thresholds for forked agent skills. Leave blank to use org defaults.
      </div>

      {fields.map(({ key, label, hint }) => (
        <div key={key}>
          <div style={labelStyle}>{label}</div>
          <input
            type="number"
            value={health[key] ?? ''}
            onChange={(e) => updateHealth({ [key]: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="default"
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{hint}</div>
        </div>
      ))}
    </div>
  );
}
