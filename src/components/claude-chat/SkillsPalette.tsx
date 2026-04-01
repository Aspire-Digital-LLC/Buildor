import { useState } from 'react';
import type { BuildorSkill, ProjectSkill } from '@/types/skill';
import { ProjectSkillEntry, BuildorSkillEntry } from './SkillEntry';
import { SkillParamsModal } from './SkillParamsModal';

interface SkillsPaletteProps {
  buildorSkills: BuildorSkill[];
  projectSkills: ProjectSkill[];
  activeEyeballs: Set<string>;
  searchQuery: string;
  onSearch: (query: string) => void;
  onToggleEyeball: (name: string) => void;
  onPrefillInput: (text: string) => void;
  onTranslateAndSpawn: (skill: ProjectSkill) => void;
  onInvokeSkill: (name: string, params: Record<string, string | number | boolean>) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  loading?: boolean;
  loadingForkSkill?: string | null;
}

export function SkillsPalette({
  buildorSkills,
  projectSkills,
  activeEyeballs,
  searchQuery,
  onSearch,
  onToggleEyeball,
  onPrefillInput,
  onTranslateAndSpawn,
  onInvokeSkill,
  isOpen,
  onToggleOpen,
  loading,
  loadingForkSkill,
}: SkillsPaletteProps) {
  const [paramsModal, setParamsModal] = useState<BuildorSkill | null>(null);
  const [projectCollapsed, setProjectCollapsed] = useState(false);
  const [buildorCollapsed, setBuildorCollapsed] = useState(false);

  const handleProjectSkillClick = (skill: ProjectSkill) => {
    if (loadingForkSkill) return; // prevent clicks during translation
    if (skill.hasFork) {
      onTranslateAndSpawn(skill);
    } else {
      onPrefillInput(`/${skill.name} `);
    }
  };

  const handleBuildorAction = (skill: BuildorSkill) => {
    if (skill.params && skill.params.length > 0) {
      setParamsModal(skill);
    } else {
      onInvokeSkill(skill.name, {});
    }
  };

  if (!isOpen) {
    return (
      <div
        onClick={onToggleOpen}
        style={{
          width: 28,
          borderLeft: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
      >
        Skills
      </div>
    );
  }

  return (
    <div style={{
      width: 220,
      borderLeft: '1px solid var(--border-primary)',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div
        onClick={onToggleOpen}
        style={{
          padding: '12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        Skills
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-primary)' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search skills..."
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 11,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: "'Cascadia Code', monospace",
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Scrollable skill list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 11, textAlign: 'center' }}>
            Loading skills...
          </div>
        )}

        {/* Project Skills Section */}
        <div>
          <div
            onClick={() => setProjectCollapsed(!projectCollapsed)}
            style={{
              padding: '8px 10px',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              userSelect: 'none',
            }}
          >
            <span>
              Project Skills
              {projectSkills.length > 0 && (
                <span style={{
                  marginLeft: 6,
                  fontSize: 9,
                  background: 'var(--border-primary)',
                  color: 'var(--text-tertiary)',
                  padding: '1px 5px',
                  borderRadius: 8,
                  fontWeight: 500,
                }}>
                  {projectSkills.length}
                </span>
              )}
            </span>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: projectCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {!projectCollapsed && (
            projectSkills.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: 11, fontStyle: 'italic' }}>
                No project skills found
              </div>
            ) : (
              projectSkills.map((s) => (
                <div key={`${s.source}:${s.name}`} style={{ position: 'relative' }}>
                  <ProjectSkillEntry
                    skill={s}
                    onClick={() => handleProjectSkillClick(s)}
                  />
                  {loadingForkSkill === s.name && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: 'var(--accent-primary)',
                      fontWeight: 600,
                    }}>
                      Loading Skill...
                    </div>
                  )}
                </div>
              ))
            )
          )}
        </div>

        {/* Buildor Skills Section */}
        <div>
          <div
            onClick={() => setBuildorCollapsed(!buildorCollapsed)}
            style={{
              padding: '8px 10px',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              userSelect: 'none',
            }}
          >
            <span>
              Buildor Skills
              {buildorSkills.length > 0 && (
                <span style={{
                  marginLeft: 6,
                  fontSize: 9,
                  background: 'var(--border-primary)',
                  color: 'var(--text-tertiary)',
                  padding: '1px 5px',
                  borderRadius: 8,
                  fontWeight: 500,
                }}>
                  {buildorSkills.length}
                </span>
              )}
            </span>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: buildorCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {!buildorCollapsed && (
            buildorSkills.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: 11, fontStyle: 'italic' }}>
                No Buildor skills found
              </div>
            ) : (
              buildorSkills.map((s) => (
                <BuildorSkillEntry
                  key={s.name}
                  skill={s}
                  isEyeballActive={activeEyeballs.has(s.name)}
                  onToggleEyeball={() => onToggleEyeball(s.name)}
                  onAction={() => handleBuildorAction(s)}
                />
              ))
            )
          )}
        </div>
      </div>

      {/* Params modal */}
      {paramsModal && paramsModal.params && (
        <SkillParamsModal
          skillName={paramsModal.name}
          params={paramsModal.params}
          onConfirm={(values) => {
            onInvokeSkill(paramsModal.name, values);
            setParamsModal(null);
          }}
          onCancel={() => setParamsModal(null)}
        />
      )}
    </div>
  );
}
