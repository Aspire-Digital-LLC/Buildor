import type { ReactNode } from 'react';
import { useTabStore } from '@/stores';
import type { PanelType } from '@/types';

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const tabIcons: Partial<Record<PanelType, ReactNode>> = {
  'source-control': (
    <svg {...iconProps}>
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 8.5c0 4-3 4.5-6 4.5s-6 .5-6 4.5" />
    </svg>
  ),
  'code-viewer': (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  'claude-chat': (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  ),
  'worktree-manager': (
    <svg {...iconProps}>
      <path d="M6 3v18" />
      <path d="M6 9h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <path d="M6 15h4a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h2" />
      <circle cx="20" cy="13" r="1.5" />
      <circle cx="20" cy="19" r="1.5" />
    </svg>
  ),
  'settings': (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore();

  if (tabs.length === 0) return null;

  return (
    <div style={{
      height: 36,
      backgroundColor: '#010409',
      borderBottom: '1px solid #21262d',
      display: 'flex',
      alignItems: 'stretch',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'auto',
        flex: 1,
        scrollbarWidth: 'none',
      }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const icon = tabIcons[tab.panelType];
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                fontSize: 12,
                color: isActive ? '#e0e0e0' : '#8b949e',
                backgroundColor: isActive ? '#0d1117' : 'transparent',
                borderRight: '1px solid #21262d',
                borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                minWidth: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#161b22';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {icon && (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {icon}
                </span>
              )}
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200,
              }}>
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isActive ? '#8b949e' : '#484f58',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 2px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e0e0e0';
                  e.currentTarget.style.backgroundColor = '#21262d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isActive ? '#8b949e' : '#484f58';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
