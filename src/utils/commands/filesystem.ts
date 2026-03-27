import { invoke } from '@tauri-apps/api/core';
import type { FileEntry, LanguageStat } from '@/types';

export async function listDirectoryRecursive(
  path: string,
  respectGitignore: boolean = true
): Promise<FileEntry[]> {
  return invoke('list_directory_recursive', { path, respectGitignore });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke('read_file_content', { path });
}

export async function writeFileContent(path: string, content: string): Promise<void> {
  return invoke('write_file_content', { path, content });
}

export async function getLanguageStats(repoPath: string): Promise<LanguageStat[]> {
  return invoke('get_language_stats', { repoPath });
}
