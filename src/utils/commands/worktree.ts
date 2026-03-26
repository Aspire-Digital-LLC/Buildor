import { invoke } from '@tauri-apps/api/core';

export async function listWorktrees(repoPath: string): Promise<string[]> {
  return invoke('list_worktrees', { repoPath });
}

export async function createWorktree(repoPath: string, branch: string, path: string): Promise<void> {
  return invoke('create_worktree', { repoPath, branch, path });
}

export async function removeWorktree(repoPath: string, path: string): Promise<void> {
  return invoke('remove_worktree', { repoPath, path });
}

export async function cleanWorktrees(repoPath: string): Promise<void> {
  return invoke('clean_worktrees', { repoPath });
}
