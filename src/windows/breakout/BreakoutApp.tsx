import type { PanelType } from '../../types';
import { SourceControl } from '../../components/source-control/SourceControl';
import { CodeViewer } from '../../components/code-viewer/CodeViewer';
import { FlowBuilder } from '../../components/flow-builder/FlowBuilder';
import { ClaudeChat } from '../../components/claude-chat/ClaudeChat';
import { CommandPalette } from '../../components/command-palette/CommandPalette';
import { WorktreeManager } from '../../components/worktree-manager/WorktreeManager';
import { ProjectSwitcher } from '../../components/project-switcher/ProjectSwitcher';
import { PlaceholderPanel } from '../../components/shared/PlaceholderPanel';

function SettingsPanel() {
  return <PlaceholderPanel title="Settings" description="Coming soon" />;
}

const panelMap: Record<PanelType, React.ComponentType> = {
  'source-control': SourceControl,
  'code-viewer': CodeViewer,
  'flow-builder': FlowBuilder,
  'claude-chat': ClaudeChat,
  'command-palette': CommandPalette,
  'worktree-manager': WorktreeManager,
  'projects': ProjectSwitcher,
  'settings': SettingsPanel,
};

const panelLabels: Record<PanelType, string> = {
  'source-control': 'Source Control',
  'code-viewer': 'Code Viewer',
  'flow-builder': 'Flow Builder',
  'claude-chat': 'Claude Chat',
  'command-palette': 'Command Palette',
  'worktree-manager': 'Worktree Manager',
  'projects': 'Projects',
  'settings': 'Settings',
};

interface BreakoutAppProps {
  panelType: PanelType;
}

export function BreakoutApp({ panelType }: BreakoutAppProps) {
  const PanelComponent = panelMap[panelType] || SourceControl;
  const label = panelLabels[panelType] || 'Unknown Panel';

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      <header style={{
        height: 36,
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        // @ts-expect-error WebkitAppRegion is a non-standard CSS property for Tauri window dragging
        WebkitAppRegion: 'drag',
      }}>
        {label}
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PanelComponent />
      </div>
    </div>
  );
}
