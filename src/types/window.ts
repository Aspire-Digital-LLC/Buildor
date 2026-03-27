export type PanelType =
  | 'source-control'
  | 'code-viewer'
  | 'flow-builder'
  | 'claude-chat'
  | 'command-palette'
  | 'worktree-manager'
  | 'projects'
  | 'settings';

export interface Tab {
  id: string;
  panelType: PanelType;
  projectName?: string;
  title: string;
  browsePath?: string;
  browseBranch?: string;
  browseIsWorktree?: boolean;
}

export interface WindowConfig {
  label: string;
  panelType: PanelType;
  title: string;
  width?: number;
  height?: number;
  projectName?: string;
  worktreePath?: string;
}

export type SessionType = 'bug' | 'issue' | 'feature' | 'documentation' | 'release';

export interface SessionInfo {
  sessionId: string;
  projectName: string;
  repoPath: string;
  worktreePath: string;
  branchName: string;
  sessionType: string;
  baseBranch: string;
  issueNumber: string | null;
  createdAt: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}
