export interface Project {
  name: string;
  repoPath: string;
  scopedSkills: string[];
  scopedFlows: string[];
  currentBranch?: string;
}

export interface ProjectConfig {
  projects: Project[];
  workflowsRepo: string | null;
  activeProjectName: string | null;
}
