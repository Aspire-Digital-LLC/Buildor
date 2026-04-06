import { create } from 'zustand';
import type { SkillParam, SkillExecution, SkillVisibility, SkillHealthConfig } from '@/types/skill';

export interface SkillEditorState {
  // Identity
  name: string;
  description: string;
  tags: string[];
  scope: 'general' | 'project';
  projects: string[];

  // Parameters
  params: SkillParam[];

  // Execution
  execution: SkillExecution;

  // Visibility
  visibility: SkillVisibility;

  // Health
  health: SkillHealthConfig;

  // Prompt
  promptContent: string;

  // Supporting files
  supportingFiles: { name: string; content: string }[];

  // Shell
  shell: 'bash' | 'powershell';
}

function defaultEditorState(): SkillEditorState {
  return {
    name: '',
    description: '',
    tags: [],
    scope: 'general',
    projects: [],
    params: [],
    execution: {},
    visibility: { autoLoad: true },
    health: {},
    promptContent: '',
    supportingFiles: [],
    shell: 'bash',
  };
}

interface SkillBuilderStore {
  // Currently open skill (null = nothing open)
  activeSkillName: string | null;

  // Editor state
  editor: SkillEditorState;

  // Original state for dirty tracking
  original: SkillEditorState | null;

  // Is creating a new skill (vs editing existing)
  isNew: boolean;

  // Dirty flag
  isDirty: boolean;

  // Actions
  openSkill: (name: string, state: SkillEditorState) => void;
  createNew: () => void;
  closeSkill: () => void;
  updateField: <K extends keyof SkillEditorState>(field: K, value: SkillEditorState[K]) => void;
  updateExecution: (updates: Partial<SkillExecution>) => void;
  updateVisibility: (updates: Partial<SkillVisibility>) => void;
  updateHealth: (updates: Partial<SkillHealthConfig>) => void;
  markSaved: () => void;
}

function computeDirty(editor: SkillEditorState, original: SkillEditorState | null): boolean {
  if (!original) return false;
  return JSON.stringify(editor) !== JSON.stringify(original);
}

export const useSkillBuilderStore = create<SkillBuilderStore>((set) => ({
  activeSkillName: null,
  editor: defaultEditorState(),
  original: null,
  isNew: false,
  isDirty: false,

  openSkill: (name, state) => {
    set({
      activeSkillName: name,
      editor: { ...state },
      original: { ...state },
      isNew: false,
      isDirty: false,
    });
  },

  createNew: () => {
    const fresh = defaultEditorState();
    set({
      activeSkillName: null,
      editor: fresh,
      original: { ...fresh },
      isNew: true,
      isDirty: false,
    });
  },

  closeSkill: () => {
    set({
      activeSkillName: null,
      editor: defaultEditorState(),
      original: null,
      isNew: false,
      isDirty: false,
    });
  },

  updateField: (field, value) => {
    set((state) => {
      const editor = { ...state.editor, [field]: value };
      return { editor, isDirty: computeDirty(editor, state.original) };
    });
  },

  updateExecution: (updates) => {
    set((state) => {
      const editor = { ...state.editor, execution: { ...state.editor.execution, ...updates } };
      return { editor, isDirty: computeDirty(editor, state.original) };
    });
  },

  updateVisibility: (updates) => {
    set((state) => {
      const editor = { ...state.editor, visibility: { ...state.editor.visibility, ...updates } };
      return { editor, isDirty: computeDirty(editor, state.original) };
    });
  },

  updateHealth: (updates) => {
    set((state) => {
      const editor = { ...state.editor, health: { ...state.editor.health, ...updates } };
      return { editor, isDirty: computeDirty(editor, state.original) };
    });
  },

  markSaved: () => {
    set((state) => ({
      original: { ...state.editor },
      isDirty: false,
      isNew: false,
      activeSkillName: state.editor.name || state.activeSkillName,
    }));
  },
}));
