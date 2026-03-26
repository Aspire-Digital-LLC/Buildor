import { useLocation, useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores';
import type { ReactNode } from 'react';

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const icons: Record<string, ReactNode> = {
  // Source Control — git branch with dot
  sourceControl: (
    <svg {...iconProps}>
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 8.5c0 4-3 4.5-6 4.5s-6 .5-6 4.5" />
    </svg>
  ),
  // Code Viewer — file with lines
  codeViewer: (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  // Flow Builder — three boxes in a row connected by lines
  flowBuilder: (
    <svg {...iconProps}>
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="9.5" y="8" width="5" height="5" rx="1" />
      <rect x="18" y="8" width="5" height="5" rx="1" />
      <path d="M6 10.5h3.5M14.5 10.5H18" />
    </svg>
  ),
  // Claude Chat — chat bubble
  claudeChat: (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  ),
  // Command Palette — terminal/command
  commandPalette: (
    <svg {...iconProps}>
      <path d="M4 17l6-6-6-6M12 19h8" />
    </svg>
  ),
  // Worktrees — git tree branches
  worktrees: (
    <svg {...iconProps}>
      <path d="M6 3v18" />
      <path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <path d="M6 15h4a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <circle cx="20" cy="13" r="1.5" />
      <circle cx="20" cy="19" r="1.5" />
    </svg>
  ),
  // Projects — folder
  projects: (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

const navItems = [
  { path: '/', icon: icons.sourceControl, label: 'Source Control' },
  { path: '/code-viewer', icon: icons.codeViewer, label: 'Code Viewer' },
  { path: '/flow-builder', icon: icons.flowBuilder, label: 'Flow Builder' },
  { path: '/claude-chat', icon: icons.claudeChat, label: 'Claude Chat' },
  { path: '/command-palette', icon: icons.commandPalette, label: 'Command Palette' },
  { path: '/worktree-manager', icon: icons.worktrees, label: 'Worktrees' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeProject = useProjectStore((s) => s.activeProject);

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
    }}>
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          title={item.label}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            background: location.pathname === item.path ? '#1a1a2e' : 'transparent',
            border: 'none',
            borderLeft: location.pathname === item.path ? '2px solid #58a6ff' : '2px solid transparent',
            cursor: 'pointer',
            borderRadius: 4,
            color: '#e0e0e0',
          }}
        >
          {item.icon}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => navigate('/projects')}
        title="Projects"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          background: location.pathname === '/projects' ? '#1a1a2e' : 'transparent',
          border: 'none',
          borderLeft: location.pathname === '/projects' ? '2px solid #58a6ff' : '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: '#e0e0e0',
          marginBottom: 4,
        }}
      >
        {icons.projects}
      </button>
      <div style={{
        maxWidth: 56,
        width: '100%',
        overflow: 'hidden',
        textAlign: 'center',
        paddingBottom: 8,
        paddingTop: 2,
      }}>
        {activeProject ? (
          <>
            <div style={{
              fontSize: 11,
              color: '#e0e0e0',
              fontWeight: 'bold',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingLeft: 4,
              paddingRight: 4,
            }}>
              {activeProject.name}
            </div>
            <div style={{
              fontSize: 10,
              color: '#6e7681',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingLeft: 4,
              paddingRight: 4,
            }}>
              {activeProject.currentBranch ?? '—'}
            </div>
          </>
        ) : (
          <div style={{
            fontSize: 10,
            color: '#6e7681',
          }}>
            No project
          </div>
        )}
      </div>
    </nav>
  );
}
