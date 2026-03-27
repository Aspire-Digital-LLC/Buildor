import { useState, useEffect, useRef } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  icon?: string;
}

const COMMANDS: SlashCommand[] = [
  { name: '/model', description: 'Switch AI model' },
  { name: '/login', description: 'Sign in to Anthropic' },
  { name: '/logout', description: 'Sign out from Anthropic' },
  { name: '/clear', description: 'Clear chat and restart session' },
  { name: '/cost', description: 'Show running cost' },
  { name: '/help', description: 'Show available commands' },
];

interface SlashCommandMenuProps {
  filter: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  selectedIndex: number;
}

export function SlashCommandMenu({ filter, onSelect, onClose, selectedIndex }: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const lowerFilter = filter.toLowerCase().slice(1); // remove leading /

  const filtered = COMMANDS.filter((cmd) =>
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

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        maxHeight: 240,
        overflow: 'auto',
        zIndex: 100,
      }}
    >
      <div style={{
        padding: '6px 10px',
        fontSize: 10,
        fontWeight: 600,
        color: '#6e7681',
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        borderBottom: '1px solid #21262d',
      }}>
        Commands
      </div>
      {filtered.map((cmd, i) => {
        const isSelected = i === selectedIndex;
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
              background: isSelected ? '#1c2128' : 'transparent',
              borderLeft: isSelected ? '2px solid #58a6ff' : '2px solid transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#58a6ff', fontFamily: "'Cascadia Code', monospace", fontWeight: 600 }}>
                {cmd.name}
              </div>
              <div style={{ fontSize: 11, color: '#8b949e' }}>
                {cmd.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function getFilteredCommands(filter: string): SlashCommand[] {
  const lowerFilter = filter.toLowerCase().slice(1);
  return COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(lowerFilter) ||
    cmd.description.toLowerCase().includes(lowerFilter)
  );
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
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        zIndex: 100,
      }}
    >
      <div style={{
        padding: '6px 10px',
        fontSize: 10,
        fontWeight: 600,
        color: '#6e7681',
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        borderBottom: '1px solid #21262d',
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
              background: isCurrent ? '#1a2332' : 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? '#1a2332' : 'transparent'; }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#e0e0e0', fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: '#8b949e' }}>{m.desc}</div>
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
