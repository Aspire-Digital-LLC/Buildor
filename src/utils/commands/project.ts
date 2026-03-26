import { invoke } from '@tauri-apps/api/core';
import type { Project } from '@/types';

export async function listProjects(): Promise<Project[]> {
  return invoke('list_projects');
}

export async function addProject(name: string, path: string): Promise<void> {
  return invoke('add_project', { name, path });
}

export async function removeProject(name: string): Promise<void> {
  return invoke('remove_project', { name });
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return invoke('get_current_branch', { repoPath });
}

export async function setActiveProject(name: string): Promise<void> {
  return invoke('set_active_project', { name });
}

export async function getActiveProject(): Promise<Project | null> {
  return invoke('get_active_project');
}
