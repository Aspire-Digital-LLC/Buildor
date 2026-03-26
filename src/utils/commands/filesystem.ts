import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '@/types';

export async function listDirectoryRecursive(
  path: string,
  respectGitignore: boolean = true
): Promise<FileEntry[]> {
  return invoke('list_directory_recursive', { path, respectGitignore });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke('read_file_content', { path });
}
