import { useWorktreeConfigStore } from '@/stores';
import type { NodeDepsStrategy } from '@/stores/worktreeConfigStore';

const strategies: { id: NodeDepsStrategy; name: string; description: string; icon: string }[] = [
  {
    id: 'none',
    name: 'None',
    description: 'Do nothing — manually install dependencies in each worktree',
    icon: '🚫',
  },
  {
    id: 'symlink',
    name: 'Symlink',
    description: 'Link node_modules from the main repo. Fast, zero disk cost, but shared state across branches',
    icon: '🔗',
  },
  {
    id: 'pnpm',
    name: 'pnpm Install',
    description: 'Run pnpm install. Uses a shared global store — fast installs, safe for divergent deps',
    icon: '⚡',
  },
  {
    id: 'npm',
    name: 'npm Install',
    description: 'Run npm install. Universal but slower, duplicates packages per worktree',
    icon: '📦',
  },
];

function StrategyCard({ strategy, isActive, onSelect }: {
  strategy: typeof strategies[number];
  isActive: boolean;
  onSelect: () => void;
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
        width: 200,
        flexShrink: 0,
      }}
    >
      {/* Icon region */}
      <div style={{
        height: 64,
        background: isActive ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        transition: 'background 0.2s',
      }}>
        {strategy.icon}
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
          {strategy.name}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: '1.3',
        }}>
          {strategy.description}
        </div>
      </div>
    </button>
  );
}

export function WorktreeSettings() {
  const { nodeDepsStrategy, setNodeDepsStrategy } = useWorktreeConfigStore();

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 20 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 16,
      }}>
        Worktrees
      </div>

      {/* Node Dependencies */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: 4,
      }}>
        Node Dependencies
      </div>
      <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
        When a new worktree is created for a project with a <code style={{ fontSize: 11, background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>package.json</code>,
        Buildor can automatically set up <code style={{ fontSize: 11, background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>node_modules</code>.
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 32,
      }}>
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            isActive={nodeDepsStrategy === s.id}
            onSelect={() => setNodeDepsStrategy(s.id)}
          />
        ))}
      </div>

      {/* Future sections placeholder hint */}
      <div style={{
        fontSize: 11,
        color: 'var(--text-tertiary)',
        fontStyle: 'italic',
      }}>
        More post-creation steps (Python venv, custom commands) coming soon.
      </div>
    </div>
  );
}
