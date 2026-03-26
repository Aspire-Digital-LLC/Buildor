import { create } from 'zustand';
import type { Tab, PanelType } from '@/types';

const panelLabels: Record<PanelType, string> = {
  'source-control': 'Source Control',
  'code-viewer': 'Code Viewer',
  'flow-builder': 'Flow Builder',
  'claude-chat': 'Claude Chat',
  'command-palette': 'Command Palette',
  'worktree-manager': 'Worktrees',
  'projects': 'Projects',
  'settings': 'Settings',
};

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (panelType: PanelType, projectName?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  getActiveTab: () => Tab | undefined;
}

let tabCounter = 0;

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (panelType, projectName) => {
    const { tabs } = get();

    // Check for existing tab with same panelType + projectName
    const existing = tabs.find(
      (t) => t.panelType === panelType && t.projectName === projectName
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const id = `${panelType}-${projectName || 'global'}-${++tabCounter}`;
    const label = panelLabels[panelType] || panelType;
    const title = projectName ? `${label} - ${projectName}` : label;

    const tab: Tab = { id, panelType, projectName, title };
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
}));
