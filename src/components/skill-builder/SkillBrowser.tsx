import { useState, useEffect, useCallback } from 'react';
import { listBuildorSkills, deleteBuildorSkill } from '@/utils/commands/skills';
import { readSkillFile } from '@/utils/commands/skills';
import { useSkillBuilderStore, type SkillEditorState } from '@/stores/skillBuilderStore';
import { buildorEvents } from '@/utils/buildorEvents';
import type { BuildorSkill } from '@/types/skill';

export function SkillBrowser() {
  const [skills, setSkills] = useState<BuildorSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeSkillName, isNew, openSkill, createNew, isDirty } = useSkillBuilderStore();

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listBuildorSkills();
      setSkills(list);
    } catch {
      setSkills([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  useEffect(() => {
    const handler = () => loadSkills();
    buildorEvents.on('skill-activated', handler);
    return () => { buildorEvents.off('skill-activated', handler); };
  }, [loadSkills]);

  const handleOpen = async (skill: BuildorSkill) => {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;

    // Load supporting file contents
    const supportingFiles: { name: string; content: string }[] = [];
    if (skill.supportingFiles) {
      for (const fname of skill.supportingFiles) {
        try {
          const content = await readSkillFile(skill.name, fname);
          supportingFiles.push({ name: fname, content });
        } catch { /* skip unreadable files */ }
      }
    }

    const state: SkillEditorState = {
      name: skill.name,
      description: skill.description,
      tags: skill.tags || [],
      scope: (skill.scope as 'general' | 'project') || 'general',
      projects: skill.projects || [],
      params: skill.params || [],
      execution: skill.execution || {},
      visibility: skill.visibility || { autoLoad: true },
      health: skill.execution?.health || {},
      promptContent: skill.promptContent || '',
      supportingFiles,
      shell: (skill.shell as 'bash' | 'powershell') || 'bash',
    };
    openSkill(skill.name, state);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    try {
      await deleteBuildorSkill(name);
      await loadSkills();
      if (activeSkillName === name) {
        useSkillBuilderStore.getState().closeSkill();
      }
      buildorEvents.emit('skill-activated', { reason: 'delete' });
    } catch { /* swallow */ }
  };

  const handleNew = () => {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;
    createNew();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Skills
        </span>
        <button
          onClick={handleNew}
          title="New Skill"
          style={{
            background: '#238636',
            border: 'none',
            color: '#fff',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {loading && (
          <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>Loading...</div>
        )}
        {!loading && skills.length === 0 && (
          <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
            No skills found.
          </div>
        )}
        {skills.map((skill) => {
          const isActive = activeSkillName === skill.name && !isNew;
          return (
            <div
              key={skill.name}
              onClick={() => handleOpen(skill)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                background: isActive ? 'var(--bg-active)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {skill.scope === 'project' ? 'Project' : 'General'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(skill.name); }}
                title="Delete"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '2px 4px',
                  borderRadius: 3,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                x
              </button>
            </div>
          );
        })}

        {isNew && (
          <div style={{
            padding: '6px 12px',
            background: 'var(--bg-active)',
            borderLeft: '2px solid var(--accent-primary)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 500, fontStyle: 'italic' }}>
              New Skill
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
