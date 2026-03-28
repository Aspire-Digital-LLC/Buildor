import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultPersonalityId } from '@/personalities/personalities';
import type { PersonalityDefinition } from '@/personalities/personalities';

interface PersonalityState {
  selectedId: string;
  customPersonalities: PersonalityDefinition[];
  setPersonality: (id: string) => void;
  addCustom: (personality: PersonalityDefinition) => void;
  updateCustom: (id: string, updates: Partial<PersonalityDefinition>) => void;
  deleteCustom: (id: string) => void;
}

export const usePersonalityStore = create<PersonalityState>()(
  persist(
    (set) => ({
      selectedId: defaultPersonalityId,
      customPersonalities: [],
      setPersonality: (id) => set({ selectedId: id }),
      addCustom: (personality) =>
        set((s) => ({
          customPersonalities: [
            ...s.customPersonalities,
            { ...personality, isBuiltIn: false },
          ],
        })),
      updateCustom: (id, updates) =>
        set((s) => ({
          customPersonalities: s.customPersonalities.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),
      deleteCustom: (id) =>
        set((s) => ({
          customPersonalities: s.customPersonalities.filter((p) => p.id !== id),
          selectedId: s.selectedId === id ? defaultPersonalityId : s.selectedId,
        })),
    }),
    { name: 'buildor-personality' },
  ),
);
