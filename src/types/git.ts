export interface GitStatus {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  branch: string;
  ahead: number;
  behind: number;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged';
  oldPath?: string;
}

export interface Branch {
  name: string;
  current: boolean;
  remote?: string;
}
