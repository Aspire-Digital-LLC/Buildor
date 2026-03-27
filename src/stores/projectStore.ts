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
    try {
      const projects = await listProjects();

      // Fetch current branch for each project
      const projectsWithBranch = await Promise.all(
        projects.map(async (p) => {
          try {
            const currentBranch = await getCurrentBranch(p.repoPath);
            return { ...p, currentBranch };
          } catch {
            return { ...p, currentBranch: undefined };
          }
        })
      );

      // Restore active project
      const active = await getActiveProject();
      let activeWithBranch: Project | null = null;
      if (active) {
        const match = projectsWithBranch.find((p) => p.name === active.name);
        activeWithBranch = match || null;
      }

      set({
        projects: projectsWithBranch,
        activeProject: activeWithBranch,
        isLoading: false,
      });
      logEvent({ functionArea: 'project', level: 'info', operation: 'load-projects', message: `Loaded ${projectsWithBranch.length} project(s)` }).catch(() => {});
    } catch (e) {
      set({ error: String(e), isLoading: false });
      logEvent({ functionArea: 'project', level: 'error', operation: 'load-projects', message: String(e) }).catch(() => {});
    }
  },

  setActiveProject: async (project) => {
    try {
      await setActiveProjectCmd(project.name);
      set({ activeProject: project, error: null });
      logEvent({ functionArea: 'project', level: 'info', operation: 'set-active', message: `Set active project: ${project.name}` }).catch(() => {});
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addProject: async (name, path) => {
    try {
      await addProjectCmd(name, path);
      await get().loadProjects();
      logEvent({ functionArea: 'project', level: 'info', operation: 'add-project', message: `Added project: ${name} (${path})` }).catch(() => {});
    } catch (e) {
      set({ error: String(e) });
      logEvent({ functionArea: 'project', level: 'error', operation: 'add-project', message: `Failed to add ${name}: ${String(e)}` }).catch(() => {});
      throw e; // Re-throw so the UI can show the error
    }
  },

  removeProject: async (name) => {
    try {
      await removeProjectCmd(name);
      const { activeProject } = get();
      if (activeProject?.name === name) {
        set({ activeProject: null });
      }
      await get().loadProjects();
      logEvent({ functionArea: 'project', level: 'info', operation: 'remove-project', message: `Removed project: ${name}` }).catch(() => {});
    } catch (e) {
      set({ error: String(e) });
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
    } catch {
      // Silently fail — branch info is non-critical
    }
  },
}));
