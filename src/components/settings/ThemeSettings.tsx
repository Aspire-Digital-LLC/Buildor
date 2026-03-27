import { useThemeStore } from '@/stores';
import { themes } from '@/themes/themes';
import type { ThemeDefinition } from '@/themes/themes';

function ThemeCard({ theme, isActive, onSelect }: {
  theme: ThemeDefinition;
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
        gap: 0,
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
      }}
    >
      {/* Swatch preview — mini app mockup */}
      <div style={{
        height: 90,
        background: theme.vars['--bg-primary'],
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Mini sidebar */}
        <div style={{
          width: 24,
          background: theme.vars['--bg-primary'],
          borderRight: `1px solid ${theme.vars['--border-primary']}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 6,
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: i === 0 ? theme.vars['--accent-primary'] : theme.vars['--border-secondary'],
            }} />
          ))}
        </div>

        {/* Mini content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Mini tab bar */}
          <div style={{
            height: 16,
            background: theme.vars['--bg-inset'],
            borderBottom: `1px solid ${theme.vars['--border-primary']}`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
            gap: 4,
          }}>
            <div style={{
              width: 32,
              height: 8,
              borderRadius: 2,
              background: theme.vars['--accent-primary'],
              opacity: 0.6,
            }} />
            <div style={{
              width: 24,
              height: 8,
              borderRadius: 2,
              background: theme.vars['--border-secondary'],
            }} />
          </div>

          {/* Mini content lines */}
          <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ width: '80%', height: 6, borderRadius: 3, background: theme.vars['--text-primary'], opacity: 0.25 }} />
            <div style={{ width: '55%', height: 6, borderRadius: 3, background: theme.vars['--text-secondary'], opacity: 0.2 }} />
            <div style={{ width: '70%', height: 6, borderRadius: 3, background: theme.vars['--text-primary'], opacity: 0.25 }} />
            <div style={{ width: '40%', height: 6, borderRadius: 3, background: theme.vars['--accent-primary'], opacity: 0.35 }} />
          </div>

          {/* Mini status bar */}
          <div style={{
            height: 12,
            background: theme.vars['--statusbar-bg'],
            borderTop: `1px solid ${theme.vars['--border-primary']}`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
            gap: 4,
          }}>
            <div style={{
              width: 20,
              height: 5,
              borderRadius: 2,
              background: theme.vars['--accent-primary'],
              opacity: 0.5,
            }} />
          </div>
        </div>
      </div>

      {/* Label */}
      <div style={{
        padding: '8px 12px',
        background: theme.vars['--bg-secondary'],
        borderTop: `1px solid ${theme.vars['--border-primary']}`,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.vars['--text-primary'],
          marginBottom: 2,
        }}>
          {theme.name}
        </div>
        <div style={{
          fontSize: 11,
          color: theme.vars['--text-secondary'],
        }}>
          {theme.description}
        </div>

        {/* Color dots */}
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {theme.swatches.map((color, i) => (
            <div key={i} style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: color,
              border: '1px solid rgba(128,128,128,0.3)',
            }} />
          ))}
        </div>
      </div>
    </button>
  );
}

export function ThemeSettings() {
  const { themeId, setTheme } = useThemeStore();

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
        Themes
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        {themes.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            onSelect={() => setTheme(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
