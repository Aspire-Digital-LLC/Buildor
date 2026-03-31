import { create } from 'zustand';
import type { GitStatus, Branch } from '@/types';
import { readFileContent } from '@/utils/commands/filesystem';
import { logEvent } from '@/utils/commands/logging';
import {
  getGitStatus,
  getFileDiffContent,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitCommit,
  gitPush,
  gitPull,
  gitListBranches,
  gitDiscardFile,
  gitDeleteUntrackedFile,
} from '@/utils/commands/git';

interface DiffState {
  filePath: string;
  staged: boolean;
  before: string;
  after: string;
  language: string;
}

interface RepoGitState {
  status: GitStatus | null;
  branches: Branch[];
  diff: DiffState | null;
  isLoading: boolean;
  error: string | null;
  commitMessage: string;
}

const DEFAULT_REPO_STATE: RepoGitState = {
  status: null,
  branches: [],
  diff: null,
  isLoading: false,
  error: null,
  commitMessage: '',
};

interface GitState {
  repos: Record<string, RepoGitState>;
  getRepo: (repoPath: string) => RepoGitState;
  refreshStatus: (repoPath: string) => Promise<void>;
  loadBranches: (repoPath: string) => Promise<void>;
  stageFiles: (repoPath: string, files: string[]) => Promise<void>;
  unstageFiles: (repoPath: string, files: string[]) => Promise<void>;
  stageAll: (repoPath: string) => Promise<void>;
  unstageAll: (repoPath: string) => Promise<void>;
  commit: (repoPath: string) => Promise<string>;
  push: (repoPath: string) => Promise<void>;
  pull: (repoPath: string) => Promise<void>;
  discardFile: (repoPath: string, filePath: string) => Promise<void>;
  discardUntrackedFile: (repoPath: string, filePath: string) => Promise<void>;
  viewDiff: (repoPath: string, filePath: string, staged: boolean) => Promise<void>;
  viewUntrackedDiff: (repoPath: string, filePath: string) => Promise<void>;
  closeDiff: (repoPath: string) => void;
  setCommitMessage: (repoPath: string, msg: string) => void;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rb: 'ruby', php: 'php', yaml: 'yaml', yml: 'yaml',
    toml: 'ini', xml: 'xml', sql: 'sql', sh: 'shell', bash: 'shell',
  };
  return map[ext] || 'plaintext';
}

function updateRepo(set: (fn: (state: GitState) => Partial<GitState>) => void, repoPath: string, updates: Partial<RepoGitState>) {
  set((state) => ({
    repos: {
      ...state.repos,
      [repoPath]: { ...(state.repos[repoPath] || DEFAULT_REPO_STATE), ...updates },
    },
  }));
}

export const useGitStore = create<GitState>((set, get) => ({
  repos: {},

  getRepo: (repoPath) => get().repos[repoPath] || DEFAULT_REPO_STATE,

  refreshStatus: async (repoPath) => {
    updateRepo(set, repoPath, { isLoading: true, error: null });
    try {
      const status = await getGitStatus(repoPath);
      updateRepo(set, repoPath, { status, isLoading: false });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'debug', operation: 'refresh-status', message: `${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked` }).catch(() => {});
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e), isLoading: false });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'refresh-status', message: String(e) }).catch(() => {});
    }
  },

  loadBranches: async (repoPath) => {
    try {
      const branches = await gitListBranches(repoPath);
      updateRepo(set, repoPath, { branches });
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
    }
  },

  stageFiles: async (repoPath, files) => {
    try {
      await gitStage(repoPath, files);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'stage', message: `Staged ${files.length} file(s): ${files.join(', ')}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'stage', message: String(e) }).catch(() => {});
    }
  },

  unstageFiles: async (repoPath, files) => {
    try {
      await gitUnstage(repoPath, files);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'unstage', message: `Unstaged ${files.length} file(s): ${files.join(', ')}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'unstage', message: String(e) }).catch(() => {});
    }
  },

  stageAll: async (repoPath) => {
    try {
      await gitStageAll(repoPath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'stage-all', message: 'Staged all files' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'stage-all', message: String(e) }).catch(() => {});
    }
  },

  unstageAll: async (repoPath) => {
    try {
      await gitUnstageAll(repoPath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'unstage-all', message: 'Unstaged all files' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'unstage-all', message: String(e) }).catch(() => {});
    }
  },

  commit: async (repoPath) => {
    const repo = get().repos[repoPath] || DEFAULT_REPO_STATE;
    if (!repo.commitMessage.trim()) {
      updateRepo(set, repoPath, { error: 'Commit message is required' });
      throw new Error('Commit message is required');
    }
    try {
      const hash = await gitCommit(repoPath, repo.commitMessage);
      updateRepo(set, repoPath, { commitMessage: '', error: null });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'commit', message: `Committed: ${repo.commitMessage} (${hash})` }).catch(() => {});
      await get().refreshStatus(repoPath);
      return hash;
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'commit', message: String(e) }).catch(() => {});
      throw e;
    }
  },

  push: async (repoPath) => {
    try {
      await gitPush(repoPath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'push', message: 'Pushed to remote' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'push', message: String(e) }).catch(() => {});
    }
  },

  pull: async (repoPath) => {
    try {
      await gitPull(repoPath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'pull', message: 'Pulled from remote' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'pull', message: String(e) }).catch(() => {});
    }
  },

  discardFile: async (repoPath, filePath) => {
    try {
      await gitDiscardFile(repoPath, filePath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'discard', message: `Discarded changes: ${filePath}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'discard', message: String(e) }).catch(() => {});
    }
  },

  discardUntrackedFile: async (repoPath, filePath) => {
    try {
      await gitDeleteUntrackedFile(repoPath, filePath);
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'discard-untracked', message: `Deleted untracked file: ${filePath}` }).catch(() => {});
      get().closeDiff(repoPath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'discard-untracked', message: String(e) }).catch(() => {});
    }
  },

  viewDiff: async (repoPath, filePath, staged) => {
    try {
      const [before, after] = await getFileDiffContent(repoPath, filePath, staged);
      updateRepo(set, repoPath, {
        diff: { filePath, staged, before, after, language: detectLanguage(filePath) },
      });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'debug', operation: 'view-diff', message: `Viewing diff: ${filePath} (${staged ? 'staged' : 'unstaged'})` }).catch(() => {});
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'view-diff', message: String(e) }).catch(() => {});
    }
  },

  viewUntrackedDiff: async (repoPath, filePath) => {
    try {
      const fullPath = repoPath.replace(/\\/g, '/') + '/' + filePath;
      const content = await readFileContent(fullPath);
      updateRepo(set, repoPath, {
        diff: { filePath, staged: false, before: '', after: content, language: detectLanguage(filePath) },
      });
    } catch (e) {
      updateRepo(set, repoPath, { error: String(e) });
    }
  },

  closeDiff: (repoPath) => updateRepo(set, repoPath, { diff: null }),

  setCommitMessage: (repoPath, msg) => updateRepo(set, repoPath, { commitMessage: msg }),
}));

/** Selector hook: returns the git state for a specific repo path */
export function useGitRepoState(repoPath: string | undefined) {
  return useGitStore((s) => (repoPath ? s.repos[repoPath] : undefined) || DEFAULT_REPO_STATE);
}
