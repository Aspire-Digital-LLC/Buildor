import { useTabStore, useThemeStore } from '@/stores';
import { TabContextProvider } from '@/contexts/TabContext';
import { Sidebar } from './Sidebar';
import { PanelContainer } from './PanelContainer';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { SourceControl } from '../source-control/SourceControl';
import { CodeViewer } from '../code-viewer/CodeViewer';
import { FlowBuilder } from '../flow-builder/FlowBuilder';
import { ClaudeChat } from '../claude-chat/ClaudeChat';
import { CommandPalette } from '../command-palette/CommandPalette';
import { WorktreeManager } from '../worktree-manager/WorktreeManager';
import { ProjectSwitcher } from '../project-switcher/ProjectSwitcher';
import { Settings } from '../settings/Settings';
import type { PanelType } from '@/types';

const panelComponents: Record<PanelType, React.ComponentType> = {
  'source-control': SourceControl,
  'code-viewer': CodeViewer,
  'flow-builder': FlowBuilder,
  'claude-chat': ClaudeChat,
  'command-palette': CommandPalette,
  'worktree-manager': WorktreeManager,
  'projects': ProjectSwitcher,
  'settings': Settings,
};

function ActivePanelRenderer() {
  const activeTab = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab;
  });

  if (!activeTab) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        fontSize: 14,
        flexDirection: 'column',
        gap: 8,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--border-secondary)' }}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M3 9h6" />
        </svg>
        <span>Open a panel from the sidebar</span>
      </div>
    );
  }

  const PanelComponent = panelComponents[activeTab.panelType];
  if (!PanelComponent) return null;

  return (
    <TabContextProvider value={{ projectName: activeTab.projectName, panelType: activeTab.panelType, browsePath: activeTab.browsePath, browseBranch: activeTab.browseBranch, browseIsWorktree: activeTab.browseIsWorktree }}>
      <PanelComponent />
    </TabContextProvider>
  );
}

export function MainLayout() {
  // Ensure theme store is initialized (triggers rehydration + applyTheme)
  useThemeStore();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Main area: Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <TabBar />
          <PanelContainer>
            <ActivePanelRenderer />
          </PanelContainer>
        </div>
      </div>
      {/* Full-width status bar at bottom */}
      <StatusBar />
    </div>
  );
}
