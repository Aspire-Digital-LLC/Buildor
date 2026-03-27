// ── Theme definitions ────────────────────────────────────────────────
// Each theme maps semantic CSS variable names to color values.
// Variables are applied to document.documentElement so they cascade everywhere.

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  /** Whether this theme uses a dark window chrome (title bar) */
  dark: boolean;
  /** Preview swatch colors shown in the picker (3-4 colors) */
  swatches: string[];
  vars: Record<string, string>;
}

// ── Shared semantic variable keys ────────────────────────────────────
// All themes MUST define every key listed below so components can rely on them.

function theme(
  id: string,
  name: string,
  description: string,
  dark: boolean,
  swatches: string[],
  vars: ThemeDefinition['vars'],
): ThemeDefinition {
  return { id, name, description, dark, swatches, vars };
}

export const themes: ThemeDefinition[] = [
  // ─── 1. Midnight (current default) ──────────────────────────────────
  theme('midnight', 'Midnight', 'The classic dark theme', true, ['#0d1117', '#1a1a2e', '#58a6ff', '#e0e0e0'], {
    '--bg-primary':          '#0d1117',
    '--bg-secondary':        '#161b22',
    '--bg-tertiary':         '#1c2128',
    '--bg-active':           '#1a1a2e',
    '--bg-elevated':         '#161b22',
    '--bg-inset':            '#010409',
    '--border-primary':      '#21262d',
    '--border-secondary':    '#30363d',
    '--text-primary':        '#e0e0e0',
    '--text-secondary':      '#8b949e',
    '--text-tertiary':       '#6e7681',
    '--text-on-accent':      '#ffffff',
    '--accent-primary':      '#58a6ff',
    '--accent-secondary':    '#1f6feb',
    '--accent-muted':        '#58a6ff22',
    '--scrollbar-track':     '#161b22',
    '--scrollbar-thumb':     '#30363d',
    '--scrollbar-hover':     '#484f58',
    '--statusbar-bg':        '#1a1a2e',
    '--shadow-color':        'rgba(0,0,0,0.4)',
  }),

  // ─── 2. Ocean ──────────────────────────────────────────────────────
  theme('ocean', 'Ocean', 'Deep blue waters', true, ['#0a192f', '#112240', '#64ffda', '#ccd6f6'], {
    '--bg-primary':          '#0a192f',
    '--bg-secondary':        '#112240',
    '--bg-tertiary':         '#1a2c4e',
    '--bg-active':           '#172a45',
    '--bg-elevated':         '#112240',
    '--bg-inset':            '#071325',
    '--border-primary':      '#1e3a5f',
    '--border-secondary':    '#2a4a7f',
    '--text-primary':        '#ccd6f6',
    '--text-secondary':      '#8892b0',
    '--text-tertiary':       '#5f6b8a',
    '--text-on-accent':      '#0a192f',
    '--accent-primary':      '#64ffda',
    '--accent-secondary':    '#3dbbaa',
    '--accent-muted':        '#64ffda22',
    '--scrollbar-track':     '#112240',
    '--scrollbar-thumb':     '#2a4a7f',
    '--scrollbar-hover':     '#3d5f9f',
    '--statusbar-bg':        '#0d1b30',
    '--shadow-color':        'rgba(2,12,27,0.5)',
  }),

  // ─── 3. Forest ─────────────────────────────────────────────────────
  theme('forest', 'Forest', 'Deep woodland greens', true, ['#1a2e1a', '#243524', '#7ddb7d', '#d4e8d4'], {
    '--bg-primary':          '#1a2e1a',
    '--bg-secondary':        '#1e351e',
    '--bg-tertiary':         '#263e26',
    '--bg-active':           '#1e3a25',
    '--bg-elevated':         '#1e351e',
    '--bg-inset':            '#142414',
    '--border-primary':      '#2d4f2d',
    '--border-secondary':    '#3a6b3a',
    '--text-primary':        '#d4e8d4',
    '--text-secondary':      '#8fb08f',
    '--text-tertiary':       '#6a8f6a',
    '--text-on-accent':      '#1a2e1a',
    '--accent-primary':      '#7ddb7d',
    '--accent-secondary':    '#4caf50',
    '--accent-muted':        '#7ddb7d22',
    '--scrollbar-track':     '#1e351e',
    '--scrollbar-thumb':     '#3a6b3a',
    '--scrollbar-hover':     '#4d8a4d',
    '--statusbar-bg':        '#162816',
    '--shadow-color':        'rgba(10,25,10,0.5)',
  }),

  // ─── 4. Aurora ─────────────────────────────────────────────────────
  theme('aurora', 'Aurora', 'Northern lights - violet and teal', true, ['#1a1035', '#251a45', '#bb86fc', '#cf94ff'], {
    '--bg-primary':          '#1a1035',
    '--bg-secondary':        '#201542',
    '--bg-tertiary':         '#2a1e52',
    '--bg-active':           '#2d1b5e',
    '--bg-elevated':         '#201542',
    '--bg-inset':            '#140c2b',
    '--border-primary':      '#3b2d6b',
    '--border-secondary':    '#4f3d8a',
    '--text-primary':        '#e8dff5',
    '--text-secondary':      '#a89cc8',
    '--text-tertiary':       '#7b6f9e',
    '--text-on-accent':      '#1a1035',
    '--accent-primary':      '#bb86fc',
    '--accent-secondary':    '#7c4dff',
    '--accent-muted':        '#bb86fc22',
    '--scrollbar-track':     '#201542',
    '--scrollbar-thumb':     '#4f3d8a',
    '--scrollbar-hover':     '#6b54aa',
    '--statusbar-bg':        '#180e30',
    '--shadow-color':        'rgba(15,8,35,0.5)',
  }),

  // ─── 5. Copper ─────────────────────────────────────────────────────
  theme('copper', 'Copper', 'Warm amber and bronze', true, ['#1c1410', '#2a1e18', '#e8a87c', '#f0d0b0'], {
    '--bg-primary':          '#1c1410',
    '--bg-secondary':        '#231a14',
    '--bg-tertiary':         '#2e231c',
    '--bg-active':           '#2a1e18',
    '--bg-elevated':         '#231a14',
    '--bg-inset':            '#150f0b',
    '--border-primary':      '#3e2e22',
    '--border-secondary':    '#5a4438',
    '--text-primary':        '#f0d0b0',
    '--text-secondary':      '#b89878',
    '--text-tertiary':       '#8a6e55',
    '--text-on-accent':      '#1c1410',
    '--accent-primary':      '#e8a87c',
    '--accent-secondary':    '#c07840',
    '--accent-muted':        '#e8a87c22',
    '--scrollbar-track':     '#231a14',
    '--scrollbar-thumb':     '#5a4438',
    '--scrollbar-hover':     '#7a5e4e',
    '--statusbar-bg':        '#1e1612',
    '--shadow-color':        'rgba(20,12,8,0.5)',
  }),

  // ─── 6. Arctic ─────────────────────────────────────────────────────
  theme('arctic', 'Arctic', 'Cool ice-blue light theme', false, ['#f0f6fc', '#e1ecf4', '#0969da', '#24292f'], {
    '--bg-primary':          '#f0f6fc',
    '--bg-secondary':        '#e1ecf4',
    '--bg-tertiary':         '#d0dbe7',
    '--bg-active':           '#daeaf6',
    '--bg-elevated':         '#ffffff',
    '--bg-inset':            '#e8f0f8',
    '--border-primary':      '#c8d8e8',
    '--border-secondary':    '#afcadc',
    '--text-primary':        '#24292f',
    '--text-secondary':      '#57606a',
    '--text-tertiary':       '#768390',
    '--text-on-accent':      '#ffffff',
    '--accent-primary':      '#0969da',
    '--accent-secondary':    '#0550ae',
    '--accent-muted':        '#0969da22',
    '--scrollbar-track':     '#e1ecf4',
    '--scrollbar-thumb':     '#afcadc',
    '--scrollbar-hover':     '#8db4cf',
    '--statusbar-bg':        '#dce8f4',
    '--shadow-color':        'rgba(27,31,36,0.12)',
  }),

  // ─── 7. Sakura ─────────────────────────────────────────────────────
  theme('sakura', 'Sakura', 'Soft cherry-blossom rose', true, ['#1e1520', '#2a1e28', '#f2a0c0', '#f0d8e4'], {
    '--bg-primary':          '#1e1520',
    '--bg-secondary':        '#241a26',
    '--bg-tertiary':         '#2e2430',
    '--bg-active':           '#2a1e2e',
    '--bg-elevated':         '#241a26',
    '--bg-inset':            '#18101a',
    '--border-primary':      '#3e2e3e',
    '--border-secondary':    '#5a4458',
    '--text-primary':        '#f0d8e4',
    '--text-secondary':      '#c0a0b0',
    '--text-tertiary':       '#907080',
    '--text-on-accent':      '#1e1520',
    '--accent-primary':      '#f2a0c0',
    '--accent-secondary':    '#d06890',
    '--accent-muted':        '#f2a0c022',
    '--scrollbar-track':     '#241a26',
    '--scrollbar-thumb':     '#5a4458',
    '--scrollbar-hover':     '#7a5e78',
    '--statusbar-bg':        '#1c1320',
    '--shadow-color':        'rgba(20,12,20,0.5)',
  }),
];

export const defaultThemeId = 'midnight';

export function getThemeById(id: string): ThemeDefinition {
  return themes.find((t) => t.id === id) || themes[0];
}

/** Apply a theme's CSS variables to the document root and update the window chrome */
export function applyTheme(themeId: string): void {
  const t = getThemeById(themeId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(t.vars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', t.id);

  // Update Tauri window title bar theme (dark/light)
  import('@tauri-apps/api/app').then(({ setTheme }) => {
    setTheme(t.dark ? 'dark' : 'light').catch(() => {});
  }).catch(() => {});
}
