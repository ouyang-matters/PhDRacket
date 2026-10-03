// Non-color design tokens: spacing, radii, borders, shadows, motion,
// typography and sizes. Components use the CSS variables generated here
// (`--space-2`, `--radius-md`, `--dur-fast`, ...) instead of magic numbers.

export const TOKENS = {
  space: { 0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 8: "2rem" },
  radius: { sm: "3px", md: "4px", lg: "6px", pill: "999px" },
  border: { width: "1px" },
  shadow: {
    menu: "0 4px 16px var(--c-shadow)",
    modal: "0 8px 30px var(--c-shadow)",
  },
  /** Milliseconds. Animations stay between 100 and 200 ms. */
  duration: { fast: 120, normal: 180 },
  easing: { standard: "cubic-bezier(0.2, 0, 0, 1)" },
  font: {
    ui: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif',
    mono: '"Cascadia Code", "JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    /** Base UI font size in px, multiplied by the UI scale preference. */
    basePx: 13,
  },
  size: {
    menubar: "1.85rem",
    activityBar: "2.6rem",
    tab: "2.05rem",
    statusBar: "1.6rem",
    toolbar: "2.1rem",
    panelTabs: "2rem",
    icon: "16px",
    iconSmall: "14px",
  },
  z: { menu: 60, overlay: 80, modal: 100, splash: 1000 },
} as const;

/** The tokens as CSS custom properties. */
export function tokenVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(TOKENS.space)) vars[`--space-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.radius)) vars[`--radius-${k}`] = v;
  vars["--border-width"] = TOKENS.border.width;
  for (const [k, v] of Object.entries(TOKENS.shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.duration)) vars[`--dur-${k}`] = `${v}ms`;
  vars["--ease"] = TOKENS.easing.standard;
  vars["--ui-font"] = TOKENS.font.ui;
  vars["--mono"] = TOKENS.font.mono;
  for (const [k, v] of Object.entries(TOKENS.size)) vars[`--size-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = v;
  for (const [k, v] of Object.entries(TOKENS.z)) vars[`--z-${k}`] = String(v);
  return vars;
}
