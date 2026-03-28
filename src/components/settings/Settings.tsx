import { useState } from 'react';
import { LogsViewer } from './LogsViewer';
import { ProjectSwitcher } from '../project-switcher/ProjectSwitcher';
import { SharedMemory } from './SharedMemory';
import { UpdateChecker } from './UpdateChecker';
import { ThemeSettings } from './ThemeSettings';
import { PersonalitySettings } from './PersonalitySettings';
import { WorktreeSettings } from './WorktreeSettings';

type SettingsSection = 'projects' | 'themes' | 'personality' | 'worktrees' | 'logs' | 'shared-memory' | 'updates';

const sections: { id: SettingsSection; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'themes', label: 'Themes' },
  { id: 'personality', label: 'Personality' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'logs', label: 'Logs' },
  { id: 'shared-memory', label: 'Shared Memory' },
  { id: 'updates', label: 'Updates' },
];

export function Settings() {
  const [active, setActive] = useState<SettingsSection>('projects');

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Settings sidebar */}
      <div style={{
        width: 180,
        borderRight: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
        paddingTop: 8,
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border-primary)',
          marginBottom: 4,
        }}>
          Settings
        </div>
        {sections.map((section) => (
          <div
            key={section.id}
            onClick={() => setActive(section.id)}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              color: active === section.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: active === section.id ? 'var(--bg-active)' : 'transparent',
              borderLeft: active === section.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (active !== section.id) e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              if (active !== section.id) e.currentTarget.style.background = 'transparent';
            }}
          >
            {section.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {active === 'projects' && <ProjectSwitcher />}
        {active === 'themes' && <ThemeSettings />}
        {active === 'personality' && <PersonalitySettings />}
        {active === 'worktrees' && <WorktreeSettings />}
        {active === 'logs' && <LogsViewer />}
        {active === 'shared-memory' && <SharedMemory />}
        {active === 'updates' && <UpdateChecker />}
      </div>
    </div>
  );
}
