import { create } from 'zustand';
import type { WindowConfig } from '@/types';

interface WindowState {
  breakoutWindows: WindowConfig[];
  addBreakoutWindow: (config: WindowConfig) => void;
  removeBreakoutWindow: (label: string) => void;
}

export const useWindowStore = create<WindowState>((set) => ({
  breakoutWindows: [],
  addBreakoutWindow: (config) =>
    set((state) => ({
      breakoutWindows: [...state.breakoutWindows, config],
    })),
  removeBreakoutWindow: (label) =>
    set((state) => ({
      breakoutWindows: state.breakoutWindows.filter((w) => w.label !== label),
    })),
}));
