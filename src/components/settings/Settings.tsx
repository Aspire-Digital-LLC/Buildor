import { useState } from 'react';
import { LogsViewer } from './LogsViewer';
import { ProjectSwitcher } from '../project-switcher/ProjectSwitcher';
import { SharedMemory } from './SharedMemory';
import { UpdateChecker } from './UpdateChecker';

type SettingsSection = 'projects' | 'logs' | 'shared-memory' | 'updates';

const sections: { id: SettingsSection; label: string }[] = [
  { id: 'projects', label: 'Projects' },
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
        borderRight: '1px solid #21262d',
        background: '#0d1117',
        flexShrink: 0,
        paddingTop: 8,
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#8b949e',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid #21262d',
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
              color: active === section.id ? '#e0e0e0' : '#8b949e',
              background: active === section.id ? '#1a1a2e' : 'transparent',
              borderLeft: active === section.id ? '2px solid #58a6ff' : '2px solid transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (active !== section.id) e.currentTarget.style.background = '#1c2128';
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
        {active === 'logs' && <LogsViewer />}
        {active === 'shared-memory' && <SharedMemory />}
        {active === 'updates' && <UpdateChecker />}
      </div>
    </div>
  );
}
