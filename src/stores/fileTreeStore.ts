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

interface FileTreeState {
  tree: FileEntry[];
  selectedFilePath: string | null;
  expandedDirs: Set<string>;
  fileContent: string | null;
  fileLanguage: string;
  isLoadingTree: boolean;
  isLoadingFile: boolean;
  error: string | null;
  loadTree: (rootPath: string) => Promise<void>;
  toggleDirectory: (path: string) => void;
  selectFile: (path: string) => Promise<void>;
  clearSelection: () => void;
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  tree: [],
  selectedFilePath: null,
  expandedDirs: new Set<string>(),
  fileContent: null,
  fileLanguage: 'plaintext',
  isLoadingTree: false,
  isLoadingFile: false,
  error: null,

  loadTree: async (rootPath) => {
    set({ isLoadingTree: true, error: null });
    try {
      const tree = await listDirectoryRecursive(rootPath, true);
      set({ tree, isLoadingTree: false, expandedDirs: new Set<string>() });
    } catch (e) {
      set({ error: String(e), isLoadingTree: false });
    }
  },

  toggleDirectory: (path) => {
    const { expandedDirs } = get();
    const next = new Set(expandedDirs);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ expandedDirs: next });
  },

  selectFile: async (path) => {
    set({ selectedFilePath: path, isLoadingFile: true, error: null });
    try {
      const content = await readFileContent(path);
      const language = detectLanguage(path);
      set({ fileContent: content, fileLanguage: language, isLoadingFile: false });
    } catch (e) {
      set({ fileContent: null, fileLanguage: 'plaintext', error: String(e), isLoadingFile: false });
    }
  },

  clearSelection: () => {
    set({
      selectedFilePath: null,
      fileContent: null,
      fileLanguage: 'plaintext',
    });
  },
}));
