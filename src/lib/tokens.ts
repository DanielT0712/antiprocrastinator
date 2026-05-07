// Hardcoded design tokens. No user tweak surface — picks frozen at:
// accent=clay, font=humanist, emergency=bottom-right, sidebar=labeled.

export const accentTokens = {
  base: 'oklch(0.68 0.08 45)',
  soft: 'oklch(0.68 0.08 45 / 0.15)',
  ink: 'oklch(0.80 0.08 45)',
};

export const fontTokens = {
  sans: "'Source Sans 3', system-ui, sans-serif",
  display: "'Source Serif 4', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const emergencyPlacement: 'bottom-right' = 'bottom-right';
export const sidebarStyle: 'labeled' = 'labeled';
