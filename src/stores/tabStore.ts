import { create } from 'zustand';
import type { Tab, PanelType } from '@/types';

const panelLabels: Record<PanelType, string> = {
  'source-control': 'Source Control',
  'code-viewer': 'Code Viewer',
  'flow-builder': 'Flow Builder',
  'claude-chat': 'Claude Chat',
  'skill-builder': 'Skill Builder',
  'command-palette': 'Command Palette',
  'worktree-manager': 'Worktrees',
  'projects': 'Projects',
  'settings': 'Settings',
};


export interface OpenTabOptions {
  browsePath?: string;
  browseBranch?: string;
  browseIsWorktree?: boolean;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (panelType: PanelType, projectName?: string, options?: OpenTabOptions) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  getActiveTab: () => Tab | undefined;
  updateCheckedOutBranch: (projectName: string, repoPath: string, newBranch: string) => void;
}

function makeTitle(panelType: PanelType, projectName?: string, browseBranch?: string): string {
  const label = panelLabels[panelType] || panelType;
  if (browseBranch && (panelType === 'code-viewer' || panelType === 'source-control')) {
    return `${projectName || ''} - ${browseBranch}`;
  }
  return projectName ? `${label} - ${projectName}` : label;
}

let tabCounter = 0;

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (panelType, projectName, options) => {
    const { tabs } = get();
    const browsePath = options?.browsePath;
    const browseBranch = options?.browseBranch;
    const browseIsWorktree = options?.browseIsWorktree;

    // Check for existing tab with same panelType + projectName + browsePath
    const existing = tabs.find(
      (t) => t.panelType === panelType && t.projectName === projectName && t.browsePath === browsePath
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const id = `${panelType}-${projectName || 'global'}-${++tabCounter}`;
    const title = makeTitle(panelType, projectName, browseBranch);

    const tab: Tab = { id, panelType, projectName, title, browsePath, browseBranch, browseIsWorktree };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
  },

  closeTab: (id) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);

      let newActiveId = state.activeTabId;
      if (state.activeTabId === id) {
        if (newTabs.length === 0) {
          newActiveId = null;
        } else if (idx >= newTabs.length) {
          newActiveId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveId = newTabs[idx].id;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  // Update all checked-out (non-worktree) tabs for a project when branch changes
  updateCheckedOutBranch: (projectName, repoPath, newBranch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (
          tab.projectName === projectName &&
          tab.browsePath === repoPath &&
          !tab.browseIsWorktree
        ) {
          return {
            ...tab,
            browseBranch: newBranch,
            title: makeTitle(tab.panelType, projectName, newBranch),
          };
        }
        return tab;
      }),
    }));
  },
}));
