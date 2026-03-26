import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTabStore, useProjectStore } from '@/stores';
import type { PanelType } from '@/types';

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const icons: Record<string, ReactNode> = {
  sourceControl: (
    <svg {...iconProps}>
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 8.5c0 4-3 4.5-6 4.5s-6 .5-6 4.5" />
    </svg>
  ),
  codeViewer: (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  flowBuilder: (
    <svg {...iconProps}>
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="9.5" y="8" width="5" height="5" rx="1" />
      <rect x="18" y="8" width="5" height="5" rx="1" />
      <path d="M6 10.5h3.5M14.5 10.5H18" />
    </svg>
  ),
  claudeChat: (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  ),
  commandPalette: (
    <svg {...iconProps}>
      <path d="M4 17l6-6-6-6M12 19h8" />
    </svg>
  ),
  worktrees: (
    <svg {...iconProps}>
      <path d="M6 3v18" />
      <path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <path d="M6 15h4a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <circle cx="20" cy="13" r="1.5" />
      <circle cx="20" cy="19" r="1.5" />
    </svg>
  ),
  projects: (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavItem {
  panelType: PanelType;
  icon: ReactNode;
  label: string;
  requiresProject: boolean;
}

const navItems: NavItem[] = [
  { panelType: 'source-control', icon: icons.sourceControl, label: 'Source Control', requiresProject: true },
  { panelType: 'code-viewer', icon: icons.codeViewer, label: 'Code Viewer', requiresProject: true },
  { panelType: 'flow-builder', icon: icons.flowBuilder, label: 'Flow Builder', requiresProject: false },
  { panelType: 'claude-chat', icon: icons.claudeChat, label: 'Claude Chat', requiresProject: false },
  { panelType: 'command-palette', icon: icons.commandPalette, label: 'Command Palette', requiresProject: false },
  { panelType: 'worktree-manager', icon: icons.worktrees, label: 'Worktrees', requiresProject: false },
];

export function Sidebar() {
  const { openTab, tabs, activeTabId } = useTabStore();
  const { projects } = useProjectStore();
  const [dropdown, setDropdown] = useState<{ panelType: PanelType; rect: DOMRect } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdown]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleNavClick = (item: NavItem, e: React.MouseEvent<HTMLButtonElement>) => {
    if (item.requiresProject) {
      if (projects.length === 0) {
        // No projects — open projects tab
        openTab('projects');
        return;
      }
      if (projects.length === 1) {
        // Single project — open directly
        openTab(item.panelType, projects[0].name);
        return;
      }
      // Multiple projects — show dropdown
      const rect = e.currentTarget.getBoundingClientRect();
      setDropdown({ panelType: item.panelType, rect });
    } else {
      openTab(item.panelType);
    }
  };

  return (
    <nav style={{
      width: 56,
      backgroundColor: '#0d1117',
      borderRight: '1px solid #21262d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      gap: 4,
      position: 'relative',
    }}>
      {navItems.map((item) => {
        const isActive = activeTab?.panelType === item.panelType;
        return (
          <button
            key={item.panelType}
            onClick={(e) => handleNavClick(item, e)}
            title={item.label}
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: isActive ? '#1a1a2e' : 'transparent',
              border: 'none',
              borderLeft: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 4,
              color: isActive ? '#e0e0e0' : '#8b949e',
            }}
          >
            {item.icon}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Projects button */}
      <button
        onClick={() => openTab('projects')}
        title="Projects"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          background: activeTab?.panelType === 'projects' ? '#1a1a2e' : 'transparent',
          border: 'none',
          borderLeft: activeTab?.panelType === 'projects' ? '2px solid #58a6ff' : '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: activeTab?.panelType === 'projects' ? '#e0e0e0' : '#8b949e',
        }}
      >
        {icons.projects}
      </button>

      {/* Settings button */}
      <button
        onClick={() => openTab('settings')}
        title="Settings"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          background: activeTab?.panelType === 'settings' ? '#1a1a2e' : 'transparent',
          border: 'none',
          borderLeft: activeTab?.panelType === 'settings' ? '2px solid #58a6ff' : '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: activeTab?.panelType === 'settings' ? '#e0e0e0' : '#8b949e',
          marginBottom: 8,
        }}
      >
        {icons.settings}
      </button>

      {/* Project dropdown */}
      {dropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: dropdown.rect.right + 4,
            top: dropdown.rect.top,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            width: 220,
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#6e7681',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: '1px solid #21262d',
          }}>
            Select Project
          </div>
          {projects.map((project) => (
            <div
              key={project.name}
              onClick={() => {
                openTab(dropdown.panelType, project.name);
                setDropdown(null);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                color: '#e0e0e0',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontWeight: 500 }}>{project.name}</div>
              {project.currentBranch && (
                <div style={{ fontSize: 11, color: '#6e7681', marginTop: 1 }}>
                  {project.currentBranch}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
