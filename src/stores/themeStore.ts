import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultThemeId, applyTheme } from '@/themes/themes';

interface ThemeState {
  themeId: string;
  setTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: defaultThemeId,
      setTheme: (id: string) => {
        applyTheme(id);
        set({ themeId: id });
      },
    }),
    { name: 'buildor-theme' },
  ),
);

// Apply theme immediately on load (covers both fresh + rehydrated state).
// For persist stores, zustand rehydrates synchronously from localStorage,
// so getState() already has the persisted value by this point.
applyTheme(useThemeStore.getState().themeId);
