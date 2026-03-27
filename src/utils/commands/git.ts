import { invoke } from '@tauri-apps/api/core';
import type { GitStatus, Branch } from '@/types';

export async function getGitStatus(repoPath: string): Promise<GitStatus> {
  return invoke('get_git_status', { repoPath });
}

export async function getGitDiff(repoPath: string, filePath?: string, staged?: boolean): Promise<string> {
  return invoke('get_git_diff', { repoPath, filePath, staged });
}

export async function getFileDiffContent(repoPath: string, filePath: string, staged: boolean): Promise<[string, string]> {
  return invoke('get_file_diff_content', { repoPath, filePath, staged });
}

export async function gitStage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_stage', { repoPath, files });
}

export async function gitUnstage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_unstage', { repoPath, files });
}

export async function gitStageAll(repoPath: string): Promise<void> {
  return invoke('git_stage_all', { repoPath });
}

export async function gitUnstageAll(repoPath: string): Promise<void> {
  return invoke('git_unstage_all', { repoPath });
}

export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return invoke('git_commit', { repoPath, message });
}

export async function gitPush(repoPath: string): Promise<void> {
  return invoke('git_push', { repoPath });
}

export async function gitPull(repoPath: string): Promise<void> {
  return invoke('git_pull', { repoPath });
}

export async function gitCreateBranch(repoPath: string, branchName: string): Promise<void> {
  return invoke('git_create_branch', { repoPath, branchName });
}

export async function gitSwitchBranch(repoPath: string, branchName: string): Promise<void> {
  return invoke('git_switch_branch', { repoPath, branchName });
}

export async function gitListBranches(repoPath: string): Promise<Branch[]> {
  return invoke('git_list_branches', { repoPath });
}

export async function gitDiscardFile(repoPath: string, filePath: string): Promise<void> {
  return invoke('git_discard_file', { repoPath, filePath });
}

export async function gitDeleteUntrackedFile(repoPath: string, filePath: string): Promise<void> {
  return invoke('git_delete_untracked_file', { repoPath, filePath });
}

export async function gitMerge(repoPath: string, branchName: string): Promise<string> {
  return invoke('git_merge', { repoPath, branchName });
}

export async function gitRebase(repoPath: string, branchName: string): Promise<string> {
  return invoke('git_rebase', { repoPath, branchName });
}

export async function gitUndoLastCommit(repoPath: string): Promise<void> {
  return invoke('git_undo_last_commit', { repoPath });
}

export async function gitDeleteBranch(repoPath: string, branchName: string, force: boolean = false): Promise<void> {
  return invoke('git_delete_branch', { repoPath, branchName, force });
}

export async function gitStash(repoPath: string): Promise<void> {
  return invoke('git_stash', { repoPath });
}

export async function gitStashPop(repoPath: string): Promise<void> {
  return invoke('git_stash_pop', { repoPath });
}

export async function gitFetch(repoPath: string): Promise<void> {
  return invoke('git_fetch', { repoPath });
}

export async function gitRevertLastPush(repoPath: string): Promise<void> {
  return invoke('git_revert_last_push', { repoPath });
}
