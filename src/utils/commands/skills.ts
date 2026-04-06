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

export async function saveSkillAndCommit(
  name: string,
  skillJson: string,
  promptMd: string,
  supportingFiles: [string, string][],
): Promise<void> {
  return invoke('save_skill_and_commit', { name, skillJson, promptMd, supportingFiles });
}

export async function readSkillFile(skillName: string, fileName: string): Promise<string> {
  return invoke('read_skill_file', { skillName, fileName });
}

export async function deleteSkillFile(skillName: string, fileName: string): Promise<void> {
  return invoke('delete_skill_file', { skillName, fileName });
}
