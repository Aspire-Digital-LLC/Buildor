import { invoke } from '@tauri-apps/api/core';
import type { BuildorSkill, ProjectSkill } from '@/types/skill';

export async function listBuildorSkills(): Promise<BuildorSkill[]> {
  return invoke('list_buildor_skills');
}

export async function getBuildorSkill(name: string): Promise<BuildorSkill> {
  return invoke('get_buildor_skill', { name });
}

export async function listProjectSkills(repoPath: string): Promise<ProjectSkill[]> {
  return invoke('list_project_skills', { repoPath });
}

export async function saveBuildorSkill(
  name: string,
  skillJson: string,
  promptMd: string,
): Promise<void> {
  return invoke('save_buildor_skill', { name, skillJson, promptMd });
}

export async function deleteBuildorSkill(name: string): Promise<void> {
  return invoke('delete_buildor_skill', { name });
}

export async function indexSkills(): Promise<BuildorSkill[]> {
  return invoke('index_skills');
}
