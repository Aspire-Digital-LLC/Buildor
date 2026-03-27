import { create } from 'zustand';
import type { Project } from '@/types';
import { logEvent } from '@/utils/commands/logging';
import {
  listProjects,
  addProject as addProjectCmd,
  removeProject as removeProjectCmd,
  getCurrentBranch,
  setActiveProject as setActiveProjectCmd,
  getActiveProject,
} from '@/utils/commands/project';

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  isLoading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  setActiveProject: (project: Project) => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  removeProject: (name: string) => Promise<void>;
  refreshCurrentBranch: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    logEvent({ functionArea: 'project', level: 'debug', operation: 'load-projects', message: 'Loading projects...' }).catch(() => {});

    let projects: Project[];
    try {
      projects = await listProjects();
      logEvent({ functionArea: 'project', level: 'debug', operation: 'load-projects', message: `listProjects returned ${projects.length} project(s)` }).catch(() => {});
    } catch (e) {
      const msg = `listProjects failed: ${String(e)}`;
      set({ error: msg, isLoading: false });
      logEvent({ functionArea: 'project', level: 'error', operation: 'load-projects', message: msg }).catch(() => {});
      return;
    }

    // Fetch current branch for each project
    const projectsWithBranch = await Promise.all(
      projects.map(async (p) => {
        try {
          const currentBranch = await getCurrentBranch(p.repoPath);
          return { ...p, currentBranch };
        } catch (e) {
          logEvent({ functionArea: 'project', level: 'warn', operation: 'get-branch', message: `Failed to get branch for ${p.name}: ${String(e)}`, repo: p.repoPath }).catch(() => {});
          return { ...p, currentBranch: undefined };
        }
      })
    );

    // Restore active project
    let activeWithBranch: Project | null = null;
    try {
      const active = await getActiveProject();
      if (active) {
        const match = projectsWithBranch.find((p) => p.name === active.name);
        activeWithBranch = match || null;
      }
    } catch (e) {
      logEvent({ functionArea: 'project', level: 'warn', operation: 'get-active', message: `Failed to restore active project: ${String(e)}` }).catch(() => {});
    }

    set({
      projects: projectsWithBranch,
      activeProject: activeWithBranch,
      isLoading: false,
    });
    const names = projectsWithBranch.map((p) => p.name).join(', ');
    logEvent({ functionArea: 'project', level: 'info', operation: 'load-projects', message: `Loaded ${projectsWithBranch.length} project(s): [${names}]${activeWithBranch ? `, active: ${activeWithBranch.name}` : ''}` }).catch(() => {});
  },

  setActiveProject: async (project) => {
    try {
      await setActiveProjectCmd(project.name);
      set({ activeProject: project, error: null });
      logEvent({ functionArea: 'project', level: 'info', operation: 'set-active', message: `Set active project: ${project.name}` }).catch(() => {});
    } catch (e) {
      const msg = `Failed to set active project: ${String(e)}`;
      set({ error: msg });
      logEvent({ functionArea: 'project', level: 'error', operation: 'set-active', message: msg }).catch(() => {});
    }
  },

  addProject: async (name, path) => {
    try {
      await addProjectCmd(name, path);
      logEvent({ functionArea: 'project', level: 'info', operation: 'add-project', message: `Added project: ${name} (${path})` }).catch(() => {});
      await get().loadProjects();
    } catch (e) {
      const msg = `Failed to add ${name}: ${String(e)}`;
      set({ error: msg });
      logEvent({ functionArea: 'project', level: 'error', operation: 'add-project', message: msg }).catch(() => {});
      throw e;
    }
  },

  removeProject: async (name) => {
    try {
      await removeProjectCmd(name);
      const { activeProject } = get();
      if (activeProject?.name === name) {
        set({ activeProject: null });
      }
      logEvent({ functionArea: 'project', level: 'info', operation: 'remove-project', message: `Removed project: ${name}` }).catch(() => {});
      await get().loadProjects();
    } catch (e) {
      const msg = `Failed to remove ${name}: ${String(e)}`;
      set({ error: msg });
      logEvent({ functionArea: 'project', level: 'error', operation: 'remove-project', message: msg }).catch(() => {});
    }
  },

  refreshCurrentBranch: async () => {
    const { activeProject } = get();
    if (!activeProject) return;
    try {
      const currentBranch = await getCurrentBranch(activeProject.repoPath);
      set({
        activeProject: { ...activeProject, currentBranch },
      });
    } catch (e) {
      logEvent({ functionArea: 'project', level: 'warn', operation: 'refresh-branch', message: `Failed to refresh branch for ${activeProject.name}: ${String(e)}`, repo: activeProject.repoPath }).catch(() => {});
    }
  },
}));
