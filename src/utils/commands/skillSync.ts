import { invoke } from '@tauri-apps/api/core';

export interface SyncStatus {
  configured: boolean;
  repoUrl: string | null;
  repoExists: boolean;
  isClean: boolean;
  isDiverged: boolean;
  lastSynced: string | null;
  currentBranch: string | null;
  error: string | null;
}

export async function configureSharedRepo(url: string): Promise<void> {
  return invoke('configure_shared_repo', { url });
}

export async function removeSharedRepoConfig(): Promise<void> {
  return invoke('remove_shared_repo_config');
}

export async function syncSkillsRepo(): Promise<SyncStatus> {
  return invoke('sync_skills_repo');
}

export async function pushSkillChanges(message: string): Promise<void> {
  return invoke('push_skill_changes', { message });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke('get_sync_status');
}
