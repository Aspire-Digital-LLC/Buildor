import { create } from 'zustand';
import type { ClaudeSession, ClaudeMessage, DisplayMode } from '@/types';

interface ClaudeState {
  session: ClaudeSession | null;
  messages: ClaudeMessage[];
  displayMode: DisplayMode;
  setSession: (session: ClaudeSession | null) => void;
  addMessage: (message: ClaudeMessage) => void;
  clearMessages: () => void;
  setDisplayMode: (mode: DisplayMode) => void;
}

export const useClaudeStore = create<ClaudeState>((set) => ({
  session: null,
  messages: [],
  displayMode: 'conversation',
  setSession: (session) => set({ session }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
}));
