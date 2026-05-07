export interface ThemeTokens {
  bg: string;
  bgRail: string;
  bgRaise: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  inkSoft: string;
  danger: string;
  accentBase?: string;
  accentSoft?: string;
  accentInk?: string;
  btnPrimaryBg?: string;
  btnPrimaryFg?: string;
}

export interface Theme {
  id: string;
  name: string;
  family: string;
  desc: string;
  tokens: ThemeTokens;
}

export const THEMES: Theme[] = [
  {
    id: 'warm-dark',
    name: 'Warm Dark',
    family: 'Default',
    desc: 'Off-black with paper-warm whites.',
    tokens: {
      bg: 'oklch(0.19 0.008 60)',
      bgRail: 'oklch(0.17 0.008 60)',
      bgRaise: 'oklch(0.22 0.008 60)',
      ink: 'oklch(0.95 0.012 85)',
      muted: 'oklch(0.62 0.010 70)',
      faint: 'oklch(0.45 0.008 70)',
      line: 'oklch(0.28 0.008 60)',
      inkSoft: 'oklch(0.28 0.010 70)',
      danger: 'oklch(0.62 0.14 25)',
    },
  },
  {
    id: 'classic-light',
    name: 'Classic',
    family: 'Light',
    desc: 'White paper, black ink. Default for daytime.',
    tokens: {
      bg: '#ffffff',
      bgRail: '#fafaf8',
      bgRaise: '#f4f3ef',
      ink: '#1a1a1a',
      muted: '#6b6b6b',
      faint: '#a4a4a4',
      line: '#e6e4df',
      inkSoft: '#ededea',
      danger: '#c44a3e',
      accentBase: '#5b6470',
      accentSoft: 'rgba(91,100,112,0.10)',
      accentInk: '#3a4250',
      btnPrimaryBg: '#5b6470',
      btnPrimaryFg: '#ffffff',
    },
  },
  {
    id: 'soft-paper',
    name: 'Soft Paper',
    family: 'Light',
    desc: 'Warm cream, brown ink. Easy on the eyes.',
    tokens: {
      bg: '#f7f3ec',
      bgRail: '#f1ece2',
      bgRaise: '#fcf8f1',
      ink: '#3d2f1f',
      muted: '#7a6a55',
      faint: '#a9967e',
      line: '#e3dac9',
      inkSoft: '#ebe1cf',
      danger: '#b54a32',
    },
  },
  {
    id: 'oled',
    name: 'Pure Black',
    family: 'Dark',
    desc: 'True black for OLED. Minimal glow.',
    tokens: {
      bg: '#000000',
      bgRail: '#0a0a0a',
      bgRaise: '#121212',
      ink: '#f0f0f0',
      muted: '#888888',
      faint: '#5a5a5a',
      line: '#1f1f1f',
      inkSoft: '#1a1a1a',
      danger: '#ef5350',
      accentBase: '#9aa3ad',
      accentSoft: 'rgba(154,163,173,0.10)',
      accentInk: '#c8ced4',
      btnPrimaryBg: '#9aa3ad',
      btnPrimaryFg: '#0a0a0a',
    },
  },
  {
    id: 'gray-slate',
    name: 'Slate',
    family: 'Dark',
    desc: 'Cool gray, blue-white text. Neutral workhorse.',
    tokens: {
      bg: '#1c1f24',
      bgRail: '#181b1f',
      bgRaise: '#22262c',
      ink: '#e8ecf1',
      muted: '#8a93a0',
      faint: '#5d6573',
      line: '#2c313a',
      inkSoft: '#262b33',
      danger: '#e57373',
    },
  },
  {
    id: 'vscode-dark',
    name: 'VSCode Dark+',
    family: 'IDE',
    desc: 'Editor blues. Familiar to anyone who codes.',
    tokens: {
      bg: '#1e1e1e',
      bgRail: '#252526',
      bgRaise: '#2d2d30',
      ink: '#d4d4d4',
      muted: '#858585',
      faint: '#5a5a5a',
      line: '#3c3c3c',
      inkSoft: '#37373d',
      danger: '#f48771',
      accentBase: '#569cd6',
      accentSoft: 'rgba(86,156,214,0.16)',
      accentInk: '#9cdcfe',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    family: 'IDE',
    desc: 'Classic teal-and-amber scheme.',
    tokens: {
      bg: '#002b36',
      bgRail: '#00232c',
      bgRaise: '#073642',
      ink: '#fdf6e3',
      muted: '#93a1a1',
      faint: '#586e75',
      line: '#0a4250',
      inkSoft: '#0d4555',
      danger: '#dc322f',
      accentBase: '#b58900',
      accentSoft: 'rgba(181,137,0,0.16)',
      accentInk: '#cb9b1f',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    family: 'IDE',
    desc: 'Warm retro tones. Mustard accents.',
    tokens: {
      bg: '#282828',
      bgRail: '#1d2021',
      bgRaise: '#32302f',
      ink: '#ebdbb2',
      muted: '#a89984',
      faint: '#7c6f64',
      line: '#3c3836',
      inkSoft: '#3a3735',
      danger: '#fb4934',
      accentBase: '#d79921',
      accentSoft: 'rgba(215,153,33,0.16)',
      accentInk: '#fabd2f',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    family: 'IDE',
    desc: 'Purple-magenta night mode.',
    tokens: {
      bg: '#282a36',
      bgRail: '#21222c',
      bgRaise: '#343746',
      ink: '#f8f8f2',
      muted: '#9ea0ad',
      faint: '#6272a4',
      line: '#3d4053',
      inkSoft: '#383a4a',
      danger: '#ff5555',
      accentBase: '#bd93f9',
      accentSoft: 'rgba(189,147,249,0.16)',
      accentInk: '#ff79c6',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    family: 'IDE',
    desc: 'Frosty arctic blues.',
    tokens: {
      bg: '#2e3440',
      bgRail: '#272b35',
      bgRaise: '#3b4252',
      ink: '#eceff4',
      muted: '#a3adbf',
      faint: '#6e7785',
      line: '#434c5e',
      inkSoft: '#3e4658',
      danger: '#bf616a',
      accentBase: '#88c0d0',
      accentSoft: 'rgba(136,192,208,0.18)',
      accentInk: '#8fbcbb',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    family: 'IDE',
    desc: 'High contrast greens and pinks.',
    tokens: {
      bg: '#272822',
      bgRail: '#1e1f1a',
      bgRaise: '#3e3d32',
      ink: '#f8f8f2',
      muted: '#a6a097',
      faint: '#75715e',
      line: '#3e3d32',
      inkSoft: '#383830',
      danger: '#f92672',
      accentBase: '#a6e22e',
      accentSoft: 'rgba(166,226,46,0.16)',
      accentInk: '#fd971f',
    },
  },
];

const DEFAULT_ACCENT = {
  base: 'oklch(0.68 0.08 45)',
  soft: 'oklch(0.68 0.08 45 / 0.15)',
  ink: 'oklch(0.80 0.08 45)',
};

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const t = theme.tokens;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--bg-rail', t.bgRail);
  r.setProperty('--bg-raise', t.bgRaise);
  r.setProperty('--ink', t.ink);
  r.setProperty('--muted', t.muted);
  r.setProperty('--faint', t.faint);
  r.setProperty('--line', t.line);
  r.setProperty('--ink-soft', t.inkSoft);
  r.setProperty('--danger', t.danger);
  r.setProperty('--accent', t.accentBase ?? DEFAULT_ACCENT.base);
  r.setProperty('--accent-soft', t.accentSoft ?? DEFAULT_ACCENT.soft);
  r.setProperty('--accent-ink', t.accentInk ?? DEFAULT_ACCENT.ink);
  r.setProperty('--btn-primary-bg', t.btnPrimaryBg ?? t.ink);
  r.setProperty('--btn-primary-fg', t.btnPrimaryFg ?? t.bg);
}
