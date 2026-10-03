// The theme engine: turns a Theme into CSS custom properties for the
// workbench and a Monaco theme for the editors. Pure; `apply.ts` performs the
// DOM and Monaco side effects.

import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, THEMES, themeById, type Theme, type ThemeColors } from "./themes";

/** `app.background` → `--c-app-background`. */
export function colorVariable(token: keyof ThemeColors): string {
  return `--c-${token.replace(/\./g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Short names used throughout the stylesheet, mapped to semantic tokens. */
const ALIASES: Record<string, keyof ThemeColors> = {
  "--bg": "app.background",
  "--bg-elev": "surface.raised",
  "--bg-sunken": "surface.sunken",
  "--border": "border.default",
  "--text": "text.primary",
  "--muted": "text.secondary",
  "--disabled": "text.disabled",
  "--accent": "accent.primary",
  "--accent-text": "accent.foreground",
  "--run": "run.background",
  "--run-hover": "run.hover",
  "--run-text": "run.foreground",
  "--danger": "error",
  "--warn": "warning",
  "--warn-bg": "warning.background",
  "--warn-border": "warning",
  "--ok": "test.pass",
  "--fail": "test.fail",
  "--value": "interaction.result",
  "--stderr": "interaction.stderr",
  "--focus": "focus.border",
  "--metadata-bg": "metadata.background",
  "--redex": "stepper.beforeHighlight",
  "--reduct": "stepper.afterHighlight",
};

export function themeVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(theme.colors) as [keyof ThemeColors, string][]) {
    vars[colorVariable(token)] = value;
  }
  for (const [alias, token] of Object.entries(ALIASES)) vars[alias] = `var(${colorVariable(token)})`;
  return vars;
}

export function isDarkKind(theme: Theme): boolean {
  return theme.kind === "dark" || theme.kind === "hc-dark";
}

/** The theme for a preference value: a theme id, or "system". */
export function resolveThemeId(choice: string, prefersDark: boolean): string {
  if (choice !== "system" && themeById(choice)) return choice;
  return prefersDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
}

export function resolveThemeChoice(choice: string, prefersDark: boolean): Theme {
  return themeById(resolveThemeId(choice, prefersDark)) ?? THEMES[0];
}

const hex = (c: string) => c.replace(/^#/, "");

/** Monaco theme data for a theme. Colors must be #rrggbb or rgba(). */
export function monacoThemeData(theme: Theme) {
  const s = theme.syntax;
  const c = theme.colors;
  const base = theme.kind === "light" ? "vs" : theme.kind === "dark" ? "vs-dark" : theme.kind === "hc-dark" ? "hc-black" : "hc-light";
  const toHexA = (color: string) => {
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
    if (!m) return color;
    const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${h(+m[4] * 255)}`;
  };
  return {
    base: base as "vs" | "vs-dark" | "hc-black" | "hc-light",
    inherit: true,
    rules: [
      { token: "comment", foreground: hex(s.comment), fontStyle: "italic" },
      { token: "comment.datum", foreground: hex(s.comment) },
      { token: "string", foreground: hex(s.string) },
      { token: "string.char", foreground: hex(s.string) },
      { token: "string.escape", foreground: hex(s.escape) },
      { token: "regexp", foreground: hex(s.escape) },
      { token: "number", foreground: hex(s.number) },
      { token: "constant.language", foreground: hex(s.number) },
      { token: "keyword", foreground: hex(s.keyword) },
      { token: "keyword.test", foreground: hex(s.test), fontStyle: "bold" },
      { token: "keyword.hash", foreground: hex(s.keyword) },
      { token: "entity.name.function", foreground: hex(s.function), fontStyle: "bold" },
      { token: "type", foreground: hex(s.type), fontStyle: "bold" },
      { token: "metatag", foreground: hex(s.meta) },
      { token: "operator.quote", foreground: hex(s.quote) },
      { token: "identifier", foreground: hex(s.identifier) },
    ],
    colors: {
      "editor.background": c["editor.background"],
      "editor.foreground": c["editor.foreground"],
      "editorLineNumber.foreground": c["editor.lineNumber"],
      "editorLineNumber.activeForeground": c["editor.lineNumberActive"],
      "editor.lineHighlightBackground": c["editor.lineHighlight"],
      "editor.selectionBackground": toHexA(c["selection.background"]),
      "editorBracketMatch.background": c["editor.bracketMatch"],
      "editorBracketMatch.border": c["accent.secondary"],
      "editorCursor.foreground": c["accent.primary"],
      "focusBorder": c["focus.border"],
      "editorWidget.background": c["menu.background"],
      "editorWidget.border": c["border.default"],
      "input.background": c["app.background"],
      "editorError.foreground": c.error,
      "editorWarning.foreground": c.warning,
      "editorGutter.background": c["editor.background"],
      "scrollbarSlider.background": toHexA(theme.kind === "light" || theme.kind === "hc-light" ? "rgba(0, 0, 0, 0.18)" : "rgba(255, 255, 255, 0.14)"),
    },
  };
}

export function monacoThemeName(theme: Theme): string {
  return `phd-${theme.id}`;
}
