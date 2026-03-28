import { useState } from 'react';
import { usePersonalityStore } from '@/stores';
import { builtInPersonalities } from '@/personalities/personalities';
import type { PersonalityDefinition } from '@/personalities/personalities';

// ── Card ─────────────────────────────────────────────────────────────

function PersonalityCard({ personality, isActive, onSelect, onEdit, onDelete }: {
  personality: PersonalityDefinition;
  isActive: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 0,
        border: isActive
          ? '2px solid var(--accent-primary)'
          : '2px solid var(--border-secondary)',
        borderRadius: 10,
        cursor: 'pointer',
        background: 'transparent',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: isActive ? '0 0 0 2px var(--accent-muted)' : 'none',
        width: 180,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Icon region */}
      <div style={{
        height: 72,
        background: isActive ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        transition: 'background 0.2s',
      }}>
        {personality.icon}
      </div>

      {/* Label */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)',
        textAlign: 'left',
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 2,
        }}>
          {personality.name}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: '1.3',
        }}>
          {personality.description}
        </div>
      </div>

      {/* Edit / Delete for custom personalities */}
      {!personality.isBuiltIn && (onEdit || onDelete) && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          display: 'flex',
          gap: 2,
        }}>
          {onEdit && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Edit"
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
          )}
          {onDelete && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
              title="Delete"
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Form ─────────────────────────────────────────────────────────────

const PROMPT_MAX = 2000;

function PersonalityForm({ initial, onSave, onCancel }: {
  initial?: PersonalityDefinition;
  onSave: (data: { name: string; icon: string; description: string; prompt: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: 13,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    display: 'block',
  };

  const valid = name.trim() && prompt.trim() && prompt.length <= PROMPT_MAX;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: 10,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: 480,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
        {initial ? 'Edit Personality' : 'Create Custom Personality'}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: '0 0 60px' }}>
          <label style={labelStyle}>Icon</label>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="e.g. emoji"
            maxLength={4}
            style={{ ...inputStyle, textAlign: 'center' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code Reviewer"
            maxLength={40}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short tagline for the card"
          maxLength={80}
          style={inputStyle}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle}>System Prompt</label>
          <span style={{
            fontSize: 10,
            color: prompt.length > PROMPT_MAX ? '#e55' : 'var(--text-tertiary)',
          }}>
            {prompt.length}/{PROMPT_MAX}
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how Claude should communicate..."
          rows={5}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: 80,
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), icon: icon || '\uD83E\uDDE9', description: description.trim(), prompt: prompt.trim() })}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: valid ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            border: '1px solid transparent',
            borderRadius: 6,
            color: valid ? '#fff' : 'var(--text-tertiary)',
            cursor: valid ? 'pointer' : 'default',
            fontWeight: 600,
          }}
        >
          {initial ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

function slugify(name: string): string {
  return 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function PersonalitySettings() {
  const { selectedId, customPersonalities, setPersonality, addCustom, updateCustom, deleteCustom } = usePersonalityStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const allPersonalities = [...builtInPersonalities, ...customPersonalities];
  const editingPersonality = editingId ? customPersonalities.find((p) => p.id === editingId) : undefined;

  const handleCreate = (data: { name: string; icon: string; description: string; prompt: string }) => {
    const id = slugify(data.name);
    // Avoid duplicate IDs
    if (allPersonalities.some((p) => p.id === id)) {
      const uniqueId = id + '-' + Date.now().toString(36);
      addCustom({ ...data, id: uniqueId, isBuiltIn: false });
    } else {
      addCustom({ ...data, id, isBuiltIn: false });
    }
    setShowForm(false);
  };

  const handleUpdate = (data: { name: string; icon: string; description: string; prompt: string }) => {
    if (editingId) {
      updateCustom(editingId, data);
      setEditingId(null);
    }
  };

  const handleDelete = (id: string) => {
    deleteCustom(id);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 20 }}>
      {/* Built-in */}
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 16,
      }}>
        Personality
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
        Choose how Claude communicates. Changes apply to new sessions.
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 32,
      }}>
        {builtInPersonalities.map((p) => (
          <PersonalityCard
            key={p.id}
            personality={p}
            isActive={selectedId === p.id}
            onSelect={() => setPersonality(p.id)}
          />
        ))}
      </div>

      {/* Custom */}
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 16,
      }}>
        Custom Personalities
      </div>

      {customPersonalities.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}>
          {customPersonalities.map((p) => (
            <PersonalityCard
              key={p.id}
              personality={p}
              isActive={selectedId === p.id}
              onSelect={() => setPersonality(p.id)}
              onEdit={() => { setEditingId(p.id); setShowForm(false); }}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* Form: create or edit */}
      {editingId && editingPersonality ? (
        <PersonalityForm
          initial={editingPersonality}
          onSave={handleUpdate}
          onCancel={() => setEditingId(null)}
        />
      ) : showForm ? (
        <PersonalityForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          + Create Custom Personality
        </button>
      )}
    </div>
  );
}
