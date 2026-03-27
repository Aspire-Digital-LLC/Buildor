import { useEffect, useRef } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  icon?: string;
  source?: 'builtin' | 'skill' | 'command';
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: '/model', description: 'Switch AI model', source: 'builtin' },
  { name: '/login', description: 'Sign in to Anthropic', source: 'builtin' },
  { name: '/logout', description: 'Sign out from Anthropic', source: 'builtin' },
  { name: '/clear', description: 'Clear chat and restart session', source: 'builtin' },
  { name: '/cost', description: 'Show running cost', source: 'builtin' },
  { name: '/help', description: 'Show available commands', source: 'builtin' },
];

interface SlashCommandMenuProps {
  filter: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  selectedIndex: number;
  dynamicCommands?: SlashCommand[];
}

export function SlashCommandMenu({ filter, onSelect, onClose, selectedIndex, dynamicCommands = [] }: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const lowerFilter = filter.toLowerCase().slice(1); // remove leading /

  const allCommands = [...BUILTIN_COMMANDS, ...dynamicCommands];

  const filtered = allCommands.filter((cmd) =>
    cmd.name.toLowerCase().includes(lowerFilter) ||
    cmd.description.toLowerCase().includes(lowerFilter)
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (filtered.length === 0) return null;

  // Group by source
  const builtins = filtered.filter((c) => c.source === 'builtin');
  const skills = filtered.filter((c) => c.source === 'skill');
  const commands = filtered.filter((c) => c.source === 'command');

  // Build flat list for index tracking
  const groups: { label: string; items: SlashCommand[] }[] = [];
  if (builtins.length > 0) groups.push({ label: 'Commands', items: builtins });
  if (skills.length > 0) groups.push({ label: 'Skills', items: skills });
  if (commands.length > 0) groups.push({ label: 'Custom Commands', items: commands });

  let flatIndex = 0;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        borderRadius: 8,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        maxHeight: 300,
        overflow: 'auto',
        zIndex: 100,
      }}
    >
      {groups.map((group) => (
        <div key={group.label}>
          <div style={{
            padding: '6px 10px',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            borderBottom: '1px solid var(--border-primary)',
          }}>
            {group.label}
          </div>
          {group.items.map((cmd) => {
            const idx = flatIndex++;
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={cmd.name}
                onClick={() => onSelect(cmd.name)}
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: 13,
                    color: cmd.source === 'builtin' ? 'var(--accent-primary)' : cmd.source === 'skill' ? '#d2a8ff' : '#7ee787',
                    fontFamily: "'Cascadia Code', monospace",
                    fontWeight: 600,
                  }}>
                    {cmd.name}
                  </div>
                  {cmd.description && (
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {cmd.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function getFilteredCommands(filter: string, dynamicCommands: SlashCommand[] = []): SlashCommand[] {
  const lowerFilter = filter.toLowerCase().slice(1);
  const allCommands = [...BUILTIN_COMMANDS, ...dynamicCommands];
  return allCommands.filter((cmd) =>
    cmd.name.toLowerCase().includes(lowerFilter) ||
    cmd.description.toLowerCase().includes(lowerFilter)
  );
}

export function isBuiltinCommand(name: string): boolean {
  return BUILTIN_COMMANDS.some((c) => c.name === name);
}

// Model picker sub-menu
const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6', desc: 'Most capable' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Fast & capable' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest' },
];

interface ModelPickerProps {
  currentModel: string | null;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

export function ModelPicker({ currentModel, onSelect, onClose }: ModelPickerProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        borderRadius: 8,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        zIndex: 100,
      }}
    >
      <div style={{
        padding: '6px 10px',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        Select Model
      </div>
      {MODELS.map((m) => {
        const isCurrent = currentModel?.includes(m.id) || currentModel?.includes(m.label.toLowerCase().replace(' ', '-'));
        return (
          <div
            key={m.id}
            onClick={() => onSelect(m.id)}
            style={{
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              background: isCurrent ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'var(--bg-active)' : 'transparent'; }}
          >
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.desc}</div>
            </div>
            {isCurrent && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
