import { useState } from 'react';
import { useSkillBuilderStore } from '@/stores/skillBuilderStore';
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

export function SkillEditor() {
  const { editor, isDirty, isNew, activeSkillName, markSaved } = useSkillBuilderStore();
  const [activeTab, setActiveTab] = useState<EditorTab>('identity');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = isNew || activeSkillName !== null;

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

      // Merge health into execution if set
      if (Object.values(editor.health).some((v) => v !== undefined)) {
        skillJson.execution = { ...(skillJson.execution as Record<string, unknown> || {}), health: editor.health };
      }

      // Clean undefined values
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
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 12px', background: '#2d1215', border: '1px solid #da3633', fontSize: 12, color: '#f85149' }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'identity' && <SkillEditorIdentity />}
        {activeTab === 'params' && <SkillEditorParams />}
        {activeTab === 'execution' && <SkillEditorExecution />}
        {activeTab === 'visibility' && <SkillEditorVisibility />}
        {activeTab === 'health' && <SkillEditorHealth />}
        {activeTab === 'prompt' && <SkillEditorPrompt />}
        {activeTab === 'files' && <SkillEditorFiles />}
      </div>
    </div>
  );
}
