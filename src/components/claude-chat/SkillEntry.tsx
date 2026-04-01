import type { BuildorSkill, ProjectSkill } from '@/types/skill';

// --- Project Skill Entry ---

interface ProjectSkillEntryProps {
  skill: ProjectSkill;
  onClick: () => void;
}

export function ProjectSkillEntry({ skill, onClick }: ProjectSkillEntryProps) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 10px',
        cursor: 'pointer',
        borderRadius: 4,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
          {skill.name}
        </span>
        {skill.hasFork && (
          <span style={{
            fontSize: 9,
            color: 'var(--accent-secondary)',
            background: 'var(--bg-active)',
            padding: '0 4px',
            borderRadius: 3,
            fontWeight: 600,
          }}>
            fork
          </span>
        )}
        <span style={{
          fontSize: 9,
          color: 'var(--text-tertiary)',
          background: 'var(--border-primary)',
          padding: '0 4px',
          borderRadius: 3,
        }}>
          {skill.source}
        </span>
      </div>
      {skill.description && (
        <div style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.description}
        </div>
      )}
    </div>
  );
}

// --- Buildor Skill Entry ---

interface BuildorSkillEntryProps {
  skill: BuildorSkill;
  isEyeballActive: boolean;
  onToggleEyeball: () => void;
  onAction: () => void;
}

export function BuildorSkillEntry({ skill, isEyeballActive, onToggleEyeball, onAction }: BuildorSkillEntryProps) {
  return (
    <div
      style={{
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 4,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Main info — fills space */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
            {skill.name}
          </span>
          {skill.tags && skill.tags.length > 0 && (
            <span style={{
              fontSize: 9,
              color: 'var(--text-tertiary)',
              background: 'var(--border-primary)',
              padding: '0 4px',
              borderRadius: 3,
            }}>
              {skill.tags[0]}
            </span>
          )}
        </div>
        {skill.description && (
          <div style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {skill.description}
          </div>
        )}
      </div>

      {/* Eyeball toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleEyeball(); }}
        title={isEyeballActive ? 'Deactivate skill' : 'Activate skill (inject description)'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          flexShrink: 0,
          color: isEyeballActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          opacity: isEyeballActive ? 1 : 0.4,
          transition: 'opacity 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { if (!isEyeballActive) e.currentTarget.style.opacity = '0.7'; }}
        onMouseLeave={(e) => { if (!isEyeballActive) e.currentTarget.style.opacity = '0.4'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={isEyeballActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* Action (play) button */}
      <button
        onClick={(e) => { e.stopPropagation(); onAction(); }}
        title="Run skill"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          flexShrink: 0,
          color: 'var(--text-tertiary)',
          opacity: 0.5,
          transition: 'opacity 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#3fb950'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="6,3 20,12 6,21" />
        </svg>
      </button>
    </div>
  );
}
