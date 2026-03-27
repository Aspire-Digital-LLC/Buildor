import { invoke } from '@tauri-apps/api/core';
import type { SessionInfo, WorktreeInfo } from '@/types';

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke('list_worktrees', { repoPath });
}

export async function createSession(params: {
  projectName: string;
  repoPath: string;
  baseBranch: string;
  sessionType: string;
  slug: string;
  issueNumber?: string;
}): Promise<SessionInfo> {
  return invoke('create_session', params);
}

export async function listSessions(): Promise<SessionInfo[]> {
  return invoke('list_sessions');
}

export async function closeSession(params: {
  sessionId: string;
  projectName: string;
  repoPath: string;
  worktreePath: string;
  force?: boolean;
}): Promise<void> {
  return invoke('close_session', params);
}

export async function closeAllSessions(projectName?: string, force?: boolean): Promise<void> {
  return invoke('close_all_sessions', { projectName, force });
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

export async function getBranchesForRepo(repoPath: string): Promise<string[]> {
  return invoke('get_branches_for_repo', { repoPath });
}
