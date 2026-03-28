import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NodeDepsStrategy = 'none' | 'symlink' | 'pnpm' | 'npm';

interface WorktreeConfigState {
  nodeDepsStrategy: NodeDepsStrategy;
  setNodeDepsStrategy: (strategy: NodeDepsStrategy) => void;
}

export const useWorktreeConfigStore = create<WorktreeConfigState>()(
  persist(
    (set) => ({
      nodeDepsStrategy: 'none',
      setNodeDepsStrategy: (strategy) => set({ nodeDepsStrategy: strategy }),
    }),
    { name: 'buildor-worktree-config' },
  ),
);
