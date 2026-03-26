import { create } from 'zustand';
import type { GitStatus, Branch } from '@/types';
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
    } catch (e) {
      set({ error: String(e), isLoading: false });
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
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageFiles: async (repoPath, files) => {
    try {
      await gitUnstage(repoPath, files);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stageAll: async (repoPath) => {
    try {
      await gitStageAll(repoPath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageAll: async (repoPath) => {
    try {
      await gitUnstageAll(repoPath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
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
      await get().refreshStatus(repoPath);
      return hash;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  push: async (repoPath) => {
    try {
      await gitPush(repoPath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  pull: async (repoPath) => {
    try {
      await gitPull(repoPath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  discardFile: async (repoPath, filePath) => {
    try {
      await gitDiscardFile(repoPath, filePath);
      await get().refreshStatus(repoPath);
    } catch (e) {
      set({ error: String(e) });
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
    } catch (e) {
      set({ error: String(e) });
    }
  },

  closeDiff: () => set({ diff: null }),

  setCommitMessage: (msg) => set({ commitMessage: msg }),
}));
