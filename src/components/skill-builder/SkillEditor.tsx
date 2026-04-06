import { useState, useCallback } from 'react';
import { useSkillBuilderStore, type FieldReview } from '@/stores/skillBuilderStore';
import { saveSkillAndCommit } from '@/utils/commands/skills';
import { buildorEvents } from '@/utils/buildorEvents';
import { logEvent } from '@/utils/commands/logging';
import { SkillEditorIdentity } from './SkillEditorIdentity';
import { SkillEditorParams } from './SkillEditorParams';
import { SkillEditorExecution } from './SkillEditorExecution';
import { SkillEditorVisibility } from './SkillEditorVisibility';
import { SkillEditorHealth } from './SkillEditorHealth';
import { SkillEditorPrompt } from './SkillEditorPrompt';
import { SkillEditorFiles } from './SkillEditorFiles';

type EditorTab = 'identity' | 'params' | 'execution' | 'visibility' | 'health' | 'prompt' | 'files';

const tabs: { id: EditorTab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'params', label: 'Params' },
  { id: 'execution', label: 'Execution' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'health', label: 'Health' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'files', label: 'Files' },
];

// Tab that owns each reviewable field — for navigating on Discuss
const fieldToTab: Record<string, EditorTab> = {
  name: 'identity', description: 'identity', tags: 'identity', scope: 'identity', projects: 'identity',
  params: 'params', promptContent: 'prompt', execution: 'execution', visibility: 'visibility', health: 'health',
};

interface SkillEditorProps {
  onDiscuss?: (field: string, message: string) => void;
}

/** Run local validation checks that don't need AI. */
function runLocalChecks(editor: ReturnType<typeof useSkillBuilderStore.getState>['editor']): Record<string, FieldReview> {
  const reviews: Record<string, FieldReview> = {};

  // Required fields
  if (!editor.name.trim()) {
    reviews.name = { status: 'error', message: 'This is a required field. Need help with this? Chat with Buildor!' };
  } else if (!/^[a-z0-9-]+$/.test(editor.name)) {
    reviews.name = { status: 'error', message: 'Name must be lowercase letters, numbers, and hyphens only.' };
  }

  if (!editor.description.trim()) {
    reviews.description = { status: 'error', message: 'This is a required field. Need help with this? Chat with Buildor!' };
  } else if (editor.description.length > 250) {
    reviews.description = { status: 'warning', message: `Description is ${editor.description.length} chars — try to keep under 250 for palette readability.` };
  }

  if (!editor.promptContent.trim()) {
    reviews.promptContent = { status: 'error', message: 'This is a required field. Need help with this? Chat with Buildor!' };
  }

  // Scope checks
  if (editor.scope === 'project' && editor.projects.length === 0) {
    reviews.projects = { status: 'error', message: 'Project scope selected but no projects chosen. Select at least one project.' };
  }

  // Param-prompt mismatch
  const promptParamRefs = [...editor.promptContent.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  const definedParamNames = editor.params.map((p) => p.name).filter(Boolean);
  const undefinedRefs = promptParamRefs.filter((ref) => !definedParamNames.includes(ref));
  if (undefinedRefs.length > 0) {
    reviews.params = { status: 'warning', message: `Prompt references undefined params: ${undefinedRefs.join(', ')}. Define them in the Params tab or remove from prompt.` };
  }

  // Tags suggestion
  if (editor.tags.length === 0 && editor.name.trim()) {
    reviews.tags = { status: 'warning', message: 'No tags set. Tags help with search and filtering in the palette.' };
  }

  return reviews;
}

export function SkillEditor({ onDiscuss: externalOnDiscuss }: SkillEditorProps) {
  const { editor, isDirty, isNew, activeSkillName, markSaved, reviews, setReviews, reviewPending, reviewInProgress, setReviewInProgress } = useSkillBuilderStore();
  const [activeTab, setActiveTab] = useState<EditorTab>('identity');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = isNew || activeSkillName !== null;

  // Has unresolved errors in reviews
  const hasReviewErrors = Object.values(reviews).some((r) => r.status === 'error');
  // Has any reviews at all (review has been run)
  const hasReviews = Object.keys(reviews).length > 0;
  // Show Save only when review passed (no errors)
  const canSave = hasReviews && !hasReviewErrors && !reviewPending;

  const handleDiscuss = useCallback((field: string, message: string) => {
    // Navigate to the tab that owns this field
    const tab = fieldToTab[field];
    if (tab) setActiveTab(tab);
    // Forward to external handler (chat panel)
    externalOnDiscuss?.(field, message);
  }, [externalOnDiscuss]);

  const handleReview = async () => {
    setReviewInProgress(true);

    // Run local checks first
    const localReviews = runLocalChecks(editor);
    setReviews(localReviews);

    // Emit event so the chat can also run AI-powered review
    buildorEvents.emit('skill-review-requested', { editor, localReviews });

    setReviewInProgress(false);
  };

  if (!isOpen) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-tertiary)', fontSize: 14, flexDirection: 'column', gap: 8,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--border-secondary)' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <span>Select a skill or create a new one</span>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editor.name) {
      setError('Skill name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const startMs = Date.now();

    try {
      const skillJson: Record<string, unknown> = {
        name: editor.name,
        description: editor.description,
        tags: editor.tags.length > 0 ? editor.tags : undefined,
        params: editor.params.length > 0 ? editor.params : undefined,
        execution: Object.keys(editor.execution).length > 0 ? editor.execution : undefined,
        visibility: editor.visibility,
        shell: editor.shell,
        scope: editor.scope,
        projects: editor.scope === 'project' ? editor.projects : undefined,
      };

      if (Object.values(editor.health).some((v) => v !== undefined)) {
        skillJson.execution = { ...(skillJson.execution as Record<string, unknown> || {}), health: editor.health };
      }

      Object.keys(skillJson).forEach((k) => {
        if (skillJson[k] === undefined) delete skillJson[k];
      });

      const supportingFiles: [string, string][] = editor.supportingFiles.map((f) => [f.name, f.content]);

      await saveSkillAndCommit(
        editor.name,
        JSON.stringify(skillJson, null, 2),
        editor.promptContent,
        supportingFiles,
      );

      markSaved();
      buildorEvents.emit('skill-activated', { reason: 'save' });

      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'save-skill',
        message: `Saved skill: ${editor.name}`,
        durationMs: Date.now() - startMs,
      }).catch(() => {});
    } catch (e) {
      setError(String(e));
      logEvent({
        functionArea: 'system',
        level: 'error',
        operation: 'save-skill',
        message: String(e),
        durationMs: Date.now() - startMs,
      }).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  // Count reviews per tab for badges
  const tabReviewCounts: Record<EditorTab, { errors: number; warnings: number }> = {
    identity: { errors: 0, warnings: 0 }, params: { errors: 0, warnings: 0 },
    execution: { errors: 0, warnings: 0 }, visibility: { errors: 0, warnings: 0 },
    health: { errors: 0, warnings: 0 }, prompt: { errors: 0, warnings: 0 },
    files: { errors: 0, warnings: 0 },
  };
  for (const [field, review] of Object.entries(reviews)) {
    const tab = fieldToTab[field];
    if (tab && tabReviewCounts[tab]) {
      if (review.status === 'error') tabReviewCounts[tab].errors++;
      else if (review.status === 'warning') tabReviewCounts[tab].warnings++;
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isNew ? 'New Skill' : editor.name}
          </span>
          {isDirty && (
            <span style={{ fontSize: 10, color: 'var(--accent-secondary)', fontWeight: 600 }}>UNSAVED</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Buildor Review button — always available */}
          <button
            onClick={handleReview}
            disabled={reviewInProgress}
            style={{
              background: 'var(--accent-primary)', border: 'none', color: '#fff', borderRadius: 4,
              padding: '4px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: reviewInProgress ? 0.5 : 1,
            }}
          >
            {reviewInProgress ? 'Reviewing...' : 'Buildor Review'}
          </button>
          {/* Save button — only after review passes */}
          {canSave && (
            <button
              onClick={handleSave}
              disabled={saving || !editor.name}
              style={{
                background: '#238636', border: 'none', color: '#fff', borderRadius: 4,
                padding: '4px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !editor.name ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 12px', background: '#2d1215', border: '1px solid #da3633', fontSize: 12, color: '#f85149' }}>
          {error}
        </div>
      )}

      {/* Tab bar with review badges */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}>
        {tabs.map((tab) => {
          const counts = tabReviewCounts[tab.id];
          const hasIssue = counts.errors > 0 || counts.warnings > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 4,
                position: 'relative',
              }}
            >
              {tab.label}
              {hasIssue && (
                <span style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: counts.errors > 0 ? '#f85149' : '#d29922',
                  flexShrink: 0,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'identity' && <SkillEditorIdentity onDiscuss={handleDiscuss} />}
        {activeTab === 'params' && <SkillEditorParams />}
        {activeTab === 'execution' && <SkillEditorExecution />}
        {activeTab === 'visibility' && <SkillEditorVisibility />}
        {activeTab === 'health' && <SkillEditorHealth />}
        {activeTab === 'prompt' && <SkillEditorPrompt onDiscuss={handleDiscuss} />}
        {activeTab === 'files' && <SkillEditorFiles />}
      </div>
    </div>
  );
}
