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

export interface FieldReview {
  status: 'pass' | 'warning' | 'error';
  message: string;
  suggestion?: string;
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

  // Review state
  reviews: Record<string, FieldReview>;
  manualFields: Set<string>;
  reviewPending: boolean;
  reviewInProgress: boolean;

  // Actions
  openSkill: (name: string, state: SkillEditorState) => void;
  createNew: () => void;
  closeSkill: () => void;
  updateField: <K extends keyof SkillEditorState>(field: K, value: SkillEditorState[K]) => void;
  updateExecution: (updates: Partial<SkillExecution>) => void;
  updateVisibility: (updates: Partial<SkillVisibility>) => void;
  updateHealth: (updates: Partial<SkillHealthConfig>) => void;
  markSaved: () => void;

  // Review actions
  setReview: (field: string, review: FieldReview) => void;
  setReviews: (reviews: Record<string, FieldReview>) => void;
  clearReview: (field: string) => void;
  clearAllReviews: () => void;
  acceptReview: (field: string) => void;
  setReviewInProgress: (inProgress: boolean) => void;
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
  reviews: {},
  manualFields: new Set(),
  reviewPending: false,
  reviewInProgress: false,

  openSkill: (name, state) => {
    set({
      activeSkillName: name,
      editor: { ...state },
      original: { ...state },
      isNew: false,
      isDirty: false,
      reviews: {},
      manualFields: new Set(),
      reviewPending: false,
      reviewInProgress: false,
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
      reviews: {},
      manualFields: new Set(),
      reviewPending: false,
      reviewInProgress: false,
    });
  },

  closeSkill: () => {
    set({
      activeSkillName: null,
      editor: defaultEditorState(),
      original: null,
      isNew: false,
      isDirty: false,
      reviews: {},
      manualFields: new Set(),
      reviewPending: false,
      reviewInProgress: false,
    });
  },

  updateField: (field, value) => {
    set((state) => {
      const editor = { ...state.editor, [field]: value };
      const manualFields = new Set(state.manualFields);
      manualFields.add(field as string);
      return {
        editor,
        isDirty: computeDirty(editor, state.original),
        manualFields,
        reviewPending: true,
      };
    });
  },

  updateExecution: (updates) => {
    set((state) => {
      const editor = { ...state.editor, execution: { ...state.editor.execution, ...updates } };
      const manualFields = new Set(state.manualFields);
      manualFields.add('execution');
      return {
        editor,
        isDirty: computeDirty(editor, state.original),
        manualFields,
        reviewPending: true,
      };
    });
  },

  updateVisibility: (updates) => {
    set((state) => {
      const editor = { ...state.editor, visibility: { ...state.editor.visibility, ...updates } };
      const manualFields = new Set(state.manualFields);
      manualFields.add('visibility');
      return {
        editor,
        isDirty: computeDirty(editor, state.original),
        manualFields,
        reviewPending: true,
      };
    });
  },

  updateHealth: (updates) => {
    set((state) => {
      const editor = { ...state.editor, health: { ...state.editor.health, ...updates } };
      const manualFields = new Set(state.manualFields);
      manualFields.add('health');
      return {
        editor,
        isDirty: computeDirty(editor, state.original),
        manualFields,
        reviewPending: true,
      };
    });
  },

  markSaved: () => {
    set((state) => ({
      original: { ...state.editor },
      isDirty: false,
      isNew: false,
      activeSkillName: state.editor.name || state.activeSkillName,
      manualFields: new Set(),
      reviewPending: false,
    }));
  },

  setReview: (field, review) => {
    set((state) => ({
      reviews: { ...state.reviews, [field]: review },
    }));
  },

  setReviews: (reviews) => {
    set({ reviews, reviewPending: false });
  },

  clearReview: (field) => {
    set((state) => {
      const reviews = { ...state.reviews };
      delete reviews[field];
      return { reviews };
    });
  },

  clearAllReviews: () => {
    set({ reviews: {}, reviewPending: false });
  },

  acceptReview: (field) => {
    set((state) => {
      const review = state.reviews[field];
      if (!review?.suggestion) return state;

      // Apply the suggestion to the editor field
      let editor = { ...state.editor };
      if (field === 'name') editor.name = review.suggestion;
      else if (field === 'description') editor.description = review.suggestion;
      else if (field === 'tags') {
        try { editor.tags = JSON.parse(review.suggestion); } catch { /* skip */ }
      }
      else if (field === 'promptContent') editor.promptContent = review.suggestion;
      else if (field === 'scope') editor.scope = review.suggestion as 'general' | 'project';

      // Remove the review and mark dirty
      const reviews = { ...state.reviews };
      delete reviews[field];

      return {
        editor,
        reviews,
        isDirty: computeDirty(editor, state.original),
      };
    });
  },

  setReviewInProgress: (inProgress) => {
    set({ reviewInProgress: inProgress });
  },
}));
