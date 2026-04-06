import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch'];
const AGENTS = ['general-purpose', 'Explore', 'Plan'];
const MODELS = ['opus', 'sonnet', 'haiku'];
const EFFORTS: string[] = ['low', 'medium', 'high', 'max'];
const RETURN_MODES = ['summary', 'file', 'both'];

export function SkillEditorExecution() {
  const { editor, updateExecution } = useSkillBuilderStore();
  const exec = editor.execution;
  const isFork = exec.context === 'fork';

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6,
    color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13,
    fontFamily: "'Cascadia Code', monospace", outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Context toggle */}
      <div>
        <div style={labelStyle}>Execution Context</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: !isFork ? 'var(--bg-active)' : 'var(--bg-primary)',
            border: `1px solid ${!isFork ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            <input type="radio" checked={!isFork} onChange={() => updateExecution({ context: undefined })} style={{ accentColor: 'var(--accent-primary)' }} />
            Inject into session
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: isFork ? 'var(--bg-active)' : 'var(--bg-primary)',
            border: `1px solid ${isFork ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            <input type="radio" checked={isFork} onChange={() => updateExecution({ context: 'fork' })} style={{ accentColor: 'var(--accent-primary)' }} />
            Fork as agent
          </label>
        </div>
      </div>

      {/* Agent type (fork only) */}
      {isFork && (
        <div>
          <div style={labelStyle}>Agent Type</div>
          <select value={exec.agent || 'general-purpose'} onChange={(e) => updateExecution({ agent: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', minWidth: 180 }}>
            {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}

      {/* Return mode (fork only) */}
      {isFork && (
        <div>
          <div style={labelStyle}>Return Mode</div>
          <select value={exec.returnMode || 'summary'} onChange={(e) => updateExecution({ returnMode: e.target.value as 'summary' | 'file' | 'both' })} style={{ ...inputStyle, cursor: 'pointer', minWidth: 140 }}>
            {RETURN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {/* Output path (fork + file/both) */}
      {isFork && (exec.returnMode === 'file' || exec.returnMode === 'both') && (
        <div>
          <div style={labelStyle}>Output Path</div>
          <input value={exec.outputPath || ''} onChange={(e) => updateExecution({ outputPath: e.target.value })} placeholder="output-{{name}}.md" style={{ ...inputStyle, width: '100%' }} />
        </div>
      )}

      {/* Model */}
      <div>
        <div style={labelStyle}>Model</div>
        <select value={exec.model || ''} onChange={(e) => updateExecution({ model: e.target.value || undefined })} style={{ ...inputStyle, cursor: 'pointer', minWidth: 140 }}>
          <option value="">Session default</option>
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Effort */}
      <div>
        <div style={labelStyle}>Effort</div>
        <select value={exec.effort || 'medium'} onChange={(e) => updateExecution({ effort: e.target.value as 'low' | 'medium' | 'high' | 'max' })} style={{ ...inputStyle, cursor: 'pointer', minWidth: 140 }}>
          {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Allowed Tools */}
      <div>
        <div style={labelStyle}>Allowed Tools</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TOOLS.map((tool) => {
            const active = exec.allowedTools?.includes(tool) || false;
            return (
              <button
                key={tool}
                onClick={() => {
                  const current = exec.allowedTools || [];
                  const next = active ? current.filter((t) => t !== tool) : [...current, tool];
                  updateExecution({ allowedTools: next.length > 0 ? next : undefined });
                }}
                style={{
                  background: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                  borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                {tool}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>Auto-accepted tools during this skill's execution.</div>
      </div>
    </div>
  );
}
