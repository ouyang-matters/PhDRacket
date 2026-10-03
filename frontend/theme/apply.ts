// Applies a theme to the whole application at once: workbench CSS variables
// and the Monaco theme shared by every editor (Definitions, editor groups,
// Interactions). No restart, no per-component theme handling.

import { monaco } from "@frontend/editor/monaco";
import { monacoThemeData, monacoThemeName, themeVariables, isDarkKind } from "./engine";
import { THEMES, type Theme } from "./themes";
import { tokenVariables } from "./tokens";

let defined = false;

function defineMonacoThemes() {
  if (defined) return;
  defined = true;
  for (const t of THEMES) monaco.editor.defineTheme(monacoThemeName(t), monacoThemeData(t));
}

let current: string | null = null;

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  defineMonacoThemes();
  if (current === null) for (const [k, v] of Object.entries(tokenVariables())) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(themeVariables(theme))) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.dataset.themeKind = theme.kind;
  root.style.colorScheme = isDarkKind(theme) ? "dark" : "light";
  if (current !== theme.id) monaco.editor.setTheme(monacoThemeName(theme));
  current = theme.id;
  try {
    // The splash screen in index.html reads this before any script loads.
    localStorage.setItem("phdracket.splash", JSON.stringify({ bg: theme.colors["app.background"], fg: theme.colors["text.primary"], accent: theme.colors["accent.primary"] }));
  } catch {
    // Storage unavailable: the splash uses its defaults.
  }
}
