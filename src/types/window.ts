export type PanelType =
  | 'source-control'
  | 'code-viewer'
  | 'flow-builder'
  | 'claude-chat'
  | 'command-palette'
  | 'worktree-manager';

export interface WindowConfig {
  label: string;
  panelType: PanelType;
  title: string;
  width?: number;
  height?: number;
  projectName?: string;
  worktreePath?: string;
}
