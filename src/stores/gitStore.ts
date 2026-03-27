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
} from '@/utils/commands/git';

interface DiffState {
  filePath: string;
  staged: boolean;
  before: string;
  after: string;
  language: string;
}

interface GitState {
  status: GitStatus | null;
  branches: Branch[];
  diff: DiffState | null;
  isLoading: boolean;
  error: string | null;
  commitMessage: string;
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
  viewDiff: (repoPath: string, filePath: string, staged: boolean) => Promise<void>;
  viewUntrackedDiff: (repoPath: string, filePath: string) => Promise<void>;
  closeDiff: () => void;
  setCommitMessage: (msg: string) => void;
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

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  branches: [],
  diff: null,
  isLoading: false,
  error: null,
  commitMessage: '',

  refreshStatus: async (repoPath) => {
    set({ isLoading: true, error: null });
    try {
      const status = await getGitStatus(repoPath);
      set({ status, isLoading: false });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'debug', operation: 'refresh-status', message: `${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked` }).catch(() => {});
    } catch (e) {
      set({ error: String(e), isLoading: false });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'refresh-status', message: String(e) }).catch(() => {});
    }
  },

  loadBranches: async (repoPath) => {
    try {
      const branches = await gitListBranches(repoPath);
      set({ branches });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stageFiles: async (repoPath, files) => {
    try {
      await gitStage(repoPath, files);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'stage', message: `Staged ${files.length} file(s): ${files.join(', ')}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'stage', message: String(e) }).catch(() => {});
    }
  },

  unstageFiles: async (repoPath, files) => {
    try {
      await gitUnstage(repoPath, files);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'unstage', message: `Unstaged ${files.length} file(s): ${files.join(', ')}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'unstage', message: String(e) }).catch(() => {});
    }
  },

  stageAll: async (repoPath) => {
    try {
      await gitStageAll(repoPath);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'stage-all', message: 'Staged all files' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'stage-all', message: String(e) }).catch(() => {});
    }
  },

  unstageAll: async (repoPath) => {
    try {
      await gitUnstageAll(repoPath);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'unstage-all', message: 'Unstaged all files' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'unstage-all', message: String(e) }).catch(() => {});
    }
  },

  commit: async (repoPath) => {
    const { commitMessage } = get();
    if (!commitMessage.trim()) {
      set({ error: 'Commit message is required' });
      throw new Error('Commit message is required');
    }
    try {
      const hash = await gitCommit(repoPath, commitMessage);
      set({ commitMessage: '', error: null });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'commit', message: `Committed: ${commitMessage} (${hash})` }).catch(() => {});
      await get().refreshStatus(repoPath);
      return hash;
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'commit', message: String(e) }).catch(() => {});
      throw e;
    }
  },

  push: async (repoPath) => {
    try {
      await gitPush(repoPath);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'push', message: 'Pushed to remote' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'push', message: String(e) }).catch(() => {});
    }
  },

  pull: async (repoPath) => {
    try {
      await gitPull(repoPath);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'pull', message: 'Pulled from remote' }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'pull', message: String(e) }).catch(() => {});
    }
  },

  discardFile: async (repoPath, filePath) => {
    try {
      await gitDiscardFile(repoPath, filePath);
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'info', operation: 'discard', message: `Discarded changes: ${filePath}` }).catch(() => {});
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'discard', message: String(e) }).catch(() => {});
    }
  },

  viewDiff: async (repoPath, filePath, staged) => {
    try {
      const [before, after] = await getFileDiffContent(repoPath, filePath, staged);
      set({
        diff: {
          filePath,
          staged,
          before,
          after,
          language: detectLanguage(filePath),
        },
      });
      logEvent({ repo: repoPath, functionArea: 'source-control', level: 'debug', operation: 'view-diff', message: `Viewing diff: ${filePath} (${staged ? 'staged' : 'unstaged'})` }).catch(() => {});
    } catch (e) {
      set({ error: String(e) });
      await logEvent({ repo: repoPath, functionArea: 'source-control', level: 'error', operation: 'view-diff', message: String(e) }).catch(() => {});
    }
  },

  viewUntrackedDiff: async (repoPath, filePath) => {
    try {
      const fullPath = repoPath.replace(/\\/g, '/') + '/' + filePath;
      const content = await readFileContent(fullPath);
      set({
        diff: {
          filePath,
          staged: false,
          before: '',
          after: content,
          language: detectLanguage(filePath),
        },
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  closeDiff: () => set({ diff: null }),

  setCommitMessage: (msg) => set({ commitMessage: msg }),
}));
