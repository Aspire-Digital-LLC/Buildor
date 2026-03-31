import { create } from 'zustand';
import type { FileEntry } from '@/types';
import { listDirectoryRecursive, readFileContent } from '@/utils/commands/filesystem';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rs': 'rust',
  '.go': 'go',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.toml': 'ini',
  '.xml': 'xml',
  '.svg': 'xml',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.scss': 'scss',
  '.less': 'less',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'html',
  '.svelte': 'html',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.env': 'plaintext',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.gitignore': 'plaintext',
  '.editorconfig': 'ini',
};

function detectLanguage(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';

  // Check for exact filename matches first
  if (fileName === 'Dockerfile') return 'dockerfile';
  if (fileName === 'Makefile') return 'makefile';
  if (fileName === 'CMakeLists.txt') return 'cmake';

  // Check extension
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot >= 0) {
    const ext = fileName.substring(lastDot).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
  }

  return 'plaintext';
}

interface RepoFileTreeState {
  tree: FileEntry[];
  selectedFilePath: string | null;
  expandedDirs: Set<string>;
  fileContent: string | null;
  fileLanguage: string;
  isLoadingTree: boolean;
  isLoadingFile: boolean;
  error: string | null;
}

const DEFAULT_REPO_STATE: RepoFileTreeState = {
  tree: [],
  selectedFilePath: null,
  expandedDirs: new Set<string>(),
  fileContent: null,
  fileLanguage: 'plaintext',
  isLoadingTree: false,
  isLoadingFile: false,
  error: null,
};

interface FileTreeState {
  repos: Record<string, RepoFileTreeState>;
  getRepo: (rootPath: string) => RepoFileTreeState;
  loadTree: (rootPath: string) => Promise<void>;
  toggleDirectory: (rootPath: string, path: string) => void;
  selectFile: (rootPath: string, path: string) => Promise<void>;
  clearSelection: (rootPath: string) => void;
}

function updateRepo(set: (fn: (state: FileTreeState) => Partial<FileTreeState>) => void, rootPath: string, updates: Partial<RepoFileTreeState>) {
  set((state) => ({
    repos: {
      ...state.repos,
      [rootPath]: { ...(state.repos[rootPath] || { ...DEFAULT_REPO_STATE, expandedDirs: new Set<string>() }), ...updates },
    },
  }));
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  repos: {},

  getRepo: (rootPath) => get().repos[rootPath] || DEFAULT_REPO_STATE,

  loadTree: async (rootPath) => {
    updateRepo(set, rootPath, { isLoadingTree: true, error: null });
    try {
      const tree = await listDirectoryRecursive(rootPath, true);
      updateRepo(set, rootPath, { tree, isLoadingTree: false, expandedDirs: new Set<string>() });
    } catch (e) {
      updateRepo(set, rootPath, { error: String(e), isLoadingTree: false });
    }
  },

  toggleDirectory: (rootPath, path) => {
    const repo = get().repos[rootPath] || { ...DEFAULT_REPO_STATE, expandedDirs: new Set<string>() };
    const next = new Set(repo.expandedDirs);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    updateRepo(set, rootPath, { expandedDirs: next });
  },

  selectFile: async (rootPath, path) => {
    updateRepo(set, rootPath, { selectedFilePath: path, isLoadingFile: true, error: null });
    try {
      const content = await readFileContent(path);
      const language = detectLanguage(path);
      updateRepo(set, rootPath, { fileContent: content, fileLanguage: language, isLoadingFile: false });
    } catch (e) {
      updateRepo(set, rootPath, { fileContent: null, fileLanguage: 'plaintext', error: String(e), isLoadingFile: false });
    }
  },

  clearSelection: (rootPath) => {
    updateRepo(set, rootPath, {
      selectedFilePath: null,
      fileContent: null,
      fileLanguage: 'plaintext',
    });
  },
}));

/** Selector hook: returns the file tree state for a specific root path */
export function useFileTreeRepoState(rootPath: string | undefined) {
  return useFileTreeStore((s) => (rootPath ? s.repos[rootPath] : undefined) || DEFAULT_REPO_STATE);
}
