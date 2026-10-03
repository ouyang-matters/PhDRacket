// Built-in color themes. A theme is data only: semantic color tokens for the
// workbench and a syntax palette for the editor. Components never reference
// a theme's colors; they use the CSS variables the theme engine derives from
// these tokens (frontend/theme/engine.ts).
//
// All palettes are original. Colors were chosen for contrast; see
// themes.test.ts for the checked ratios.

export type ThemeKind = "light" | "dark" | "hc-dark" | "hc-light";

/** Semantic color tokens. */
export interface ThemeColors {
  "app.background": string;
  "surface.raised": string;
  "surface.sunken": string;
  "editor.background": string;
  "editor.foreground": string;
  "editor.lineHighlight": string;
  "editor.lineNumber": string;
  "editor.lineNumberActive": string;
  "editor.bracketMatch": string;
  "sidebar.background": string;
  "activityBar.background": string;
  "panel.background": string;
  "statusBar.background": string;
  "statusBar.foreground": string;
  "menu.background": string;
  "tab.activeBackground": string;
  "tab.inactiveBackground": string;
  "border.default": string;
  "text.primary": string;
  "text.secondary": string;
  "text.disabled": string;
  "accent.primary": string;
  /** Text on `accent.primary` backgrounds. */
  "accent.foreground": string;
  "accent.secondary": string;
  "selection.background": string;
  "focus.border": string;
  error: string;
  warning: string;
  "warning.background": string;
  success: string;
  info: string;
  "run.background": string;
  "run.hover": string;
  "run.foreground": string;
  "test.pass": string;
  "test.fail": string;
  "stepper.beforeHighlight": string;
  "stepper.afterHighlight": string;
  "interaction.input": string;
  "interaction.result": string;
  "interaction.stderr": string;
  "problemRegion.border": string;
  "problemRegion.background": string;
  "metadata.background": string;
  "remote.active": string;
  "remote.disconnected": string;
  shadow: string;
}

/** Editor syntax colors, as #rrggbb. */
export interface SyntaxPalette {
  comment: string;
  string: string;
  escape: string;
  number: string;
  keyword: string;
  test: string;
  function: string;
  type: string;
  meta: string;
  quote: string;
  identifier: string;
}

export interface Theme {
  id: string;
  name: string;
  kind: ThemeKind;
  /** One line shown in the theme picker. */
  description?: string;
  /** Community themes inspired by a visual identity they are not affiliated with. */
  unofficial?: boolean;
  colors: ThemeColors;
  syntax: SyntaxPalette;
}

const phdLight: Theme = {
  id: "phd-light",
  name: "PhDRacket Light",
  kind: "light",
  colors: {
    "app.background": "#f6f6f3",
    "surface.raised": "#fcfcfb",
    "surface.sunken": "#efefeb",
    "editor.background": "#fcfcfb",
    "editor.foreground": "#1f2328",
    "editor.lineHighlight": "#f2f2ef",
    "editor.lineNumber": "#8a9099",
    "editor.lineNumberActive": "#3c4043",
    "editor.bracketMatch": "#d7e3f7",
    "sidebar.background": "#f1f1ed",
    "activityBar.background": "#ebebe6",
    "panel.background": "#f6f6f3",
    "statusBar.background": "#ebebe6",
    "statusBar.foreground": "#3a3f45",
    "menu.background": "#fcfcfb",
    "tab.activeBackground": "#fcfcfb",
    "tab.inactiveBackground": "#efefea",
    "border.default": "#dcdcd6",
    "text.primary": "#1f2328",
    "text.secondary": "#596069",
    "text.disabled": "#9aa0a6",
    "accent.primary": "#1f5fae",
    "accent.foreground": "#ffffff",
    "accent.secondary": "#5a7fb5",
    "selection.background": "#c9dbf5",
    "focus.border": "#2f6fd6",
    error: "#b4231b",
    warning: "#8a5a00",
    "warning.background": "#fff6dc",
    success: "#1d7a46",
    info: "#1f5fae",
    "run.background": "#1d7a46",
    "run.hover": "#17643a",
    "run.foreground": "#ffffff",
    "test.pass": "#1d7a46",
    "test.fail": "#b4231b",
    "stepper.beforeHighlight": "rgba(46, 160, 67, 0.22)",
    "stepper.afterHighlight": "rgba(130, 80, 223, 0.2)",
    "interaction.input": "#1f2328",
    "interaction.result": "#1d3f8a",
    "interaction.stderr": "#b4231b",
    "problemRegion.border": "#9db7de",
    "problemRegion.background": "rgba(31, 95, 174, 0.05)",
    "metadata.background": "rgba(120, 120, 110, 0.07)",
    "remote.active": "#1d7a46",
    "remote.disconnected": "#596069",
    shadow: "rgba(0, 0, 0, 0.18)",
  },
  syntax: {
    comment: "#5f6670",
    string: "#0b7a3b",
    escape: "#7a5f00",
    number: "#1c5fb0",
    keyword: "#7a1fa2",
    test: "#a8420f",
    function: "#1d3f8a",
    type: "#8a5100",
    meta: "#60656c",
    quote: "#a8420f",
    identifier: "#1f2328",
  },
};

const phdDark: Theme = {
  id: "phd-dark",
  name: "PhDRacket Dark",
  kind: "dark",
  colors: {
    "app.background": "#121417",
    "surface.raised": "#191c20",
    "surface.sunken": "#0e1013",
    "editor.background": "#16181c",
    "editor.foreground": "#e6edf3",
    "editor.lineHighlight": "#1e2126",
    "editor.lineNumber": "#6b7380",
    "editor.lineNumberActive": "#c9d1d9",
    "editor.bracketMatch": "#2b3b55",
    "sidebar.background": "#14161a",
    "activityBar.background": "#101215",
    "panel.background": "#121417",
    "statusBar.background": "#0f1114",
    "statusBar.foreground": "#aab1ba",
    "menu.background": "#1b1e23",
    "tab.activeBackground": "#16181c",
    "tab.inactiveBackground": "#121417",
    "border.default": "#2b2f36",
    "text.primary": "#e6edf3",
    "text.secondary": "#9aa1aa",
    "text.disabled": "#5c636e",
    "accent.primary": "#5b9bf0",
    "accent.foreground": "#0b1220",
    "accent.secondary": "#89b4f0",
    "selection.background": "#264066",
    "focus.border": "#79b0ff",
    error: "#ff7b72",
    warning: "#e3b341",
    "warning.background": "#2d2610",
    success: "#56d364",
    info: "#79b0ff",
    "run.background": "#2f9e5f",
    "run.hover": "#3fb871",
    "run.foreground": "#06140c",
    "test.pass": "#56d364",
    "test.fail": "#ff7b72",
    "stepper.beforeHighlight": "rgba(63, 185, 80, 0.28)",
    "stepper.afterHighlight": "rgba(163, 113, 247, 0.3)",
    "interaction.input": "#e6edf3",
    "interaction.result": "#9ecbff",
    "interaction.stderr": "#ff9b94",
    "problemRegion.border": "#3b5a88",
    "problemRegion.background": "rgba(91, 155, 240, 0.06)",
    "metadata.background": "rgba(160, 170, 190, 0.07)",
    "remote.active": "#56d364",
    "remote.disconnected": "#9aa1aa",
    shadow: "rgba(0, 0, 0, 0.45)",
  },
  syntax: {
    comment: "#8b949e",
    string: "#8fd19e",
    escape: "#e3c47a",
    number: "#8cb8ff",
    keyword: "#d2a8ff",
    test: "#ffa66b",
    function: "#9ecbff",
    type: "#f0b860",
    meta: "#8b929b",
    quote: "#ffa66b",
    identifier: "#e6edf3",
  },
};

const midnight: Theme = {
  id: "midnight",
  name: "Midnight",
  kind: "dark",
  description: "Deep blue, low glare",
  colors: {
    ...phdDark.colors,
    "app.background": "#0b1020",
    "surface.raised": "#121a2e",
    "surface.sunken": "#080c18",
    "editor.background": "#0e1426",
    "editor.foreground": "#dbe3f4",
    "editor.lineHighlight": "#141c33",
    "editor.lineNumber": "#56627f",
    "editor.lineNumberActive": "#c3cde6",
    "editor.bracketMatch": "#24345c",
    "sidebar.background": "#0c1222",
    "activityBar.background": "#090e1b",
    "panel.background": "#0b1020",
    "statusBar.background": "#080c18",
    "statusBar.foreground": "#a3aec8",
    "menu.background": "#131b30",
    "tab.activeBackground": "#0e1426",
    "tab.inactiveBackground": "#0b1020",
    "border.default": "#1f2a45",
    "text.primary": "#dbe3f4",
    "text.secondary": "#97a3bf",
    "text.disabled": "#56627f",
    "accent.primary": "#7c9cff",
    "accent.foreground": "#0a0f1f",
    "accent.secondary": "#a5b8ff",
    "selection.background": "#26386a",
    "focus.border": "#9db3ff",
    "remote.disconnected": "#97a3bf",
  },
  syntax: {
    comment: "#7c88a6",
    string: "#9ad7a8",
    escape: "#e8c77d",
    number: "#8fb7ff",
    keyword: "#c3a6ff",
    test: "#ffab76",
    function: "#a9c7ff",
    type: "#f2c06b",
    meta: "#7f8aa6",
    quote: "#ffab76",
    identifier: "#dbe3f4",
  },
};

const hcDark: Theme = {
  id: "hc-dark",
  name: "High Contrast Dark",
  kind: "hc-dark",
  colors: {
    "app.background": "#000000",
    "surface.raised": "#000000",
    "surface.sunken": "#000000",
    "editor.background": "#000000",
    "editor.foreground": "#ffffff",
    "editor.lineHighlight": "#000000",
    "editor.lineNumber": "#d0d0d0",
    "editor.lineNumberActive": "#ffffff",
    "editor.bracketMatch": "#333300",
    "sidebar.background": "#000000",
    "activityBar.background": "#000000",
    "panel.background": "#000000",
    "statusBar.background": "#000000",
    "statusBar.foreground": "#ffffff",
    "menu.background": "#000000",
    "tab.activeBackground": "#000000",
    "tab.inactiveBackground": "#000000",
    "border.default": "#ffffff",
    "text.primary": "#ffffff",
    "text.secondary": "#e0e0e0",
    "text.disabled": "#a0a0a0",
    "accent.primary": "#ffd700",
    "accent.foreground": "#000000",
    "accent.secondary": "#ffe766",
    "selection.background": "#3a3a00",
    "focus.border": "#ffd700",
    error: "#ff6060",
    warning: "#ffd700",
    "warning.background": "#000000",
    success: "#00ff7f",
    info: "#9ecbff",
    "run.background": "#00ff7f",
    "run.hover": "#7fffbf",
    "run.foreground": "#000000",
    "test.pass": "#00ff7f",
    "test.fail": "#ff6060",
    "stepper.beforeHighlight": "rgba(0, 255, 127, 0.35)",
    "stepper.afterHighlight": "rgba(255, 215, 0, 0.35)",
    "interaction.input": "#ffffff",
    "interaction.result": "#9ecbff",
    "interaction.stderr": "#ff9090",
    "problemRegion.border": "#ffd700",
    "problemRegion.background": "rgba(255, 215, 0, 0.08)",
    "metadata.background": "rgba(255, 255, 255, 0.12)",
    "remote.active": "#00ff7f",
    "remote.disconnected": "#e0e0e0",
    shadow: "rgba(0, 0, 0, 0)",
  },
  syntax: {
    comment: "#c0c0c0",
    string: "#7fff9f",
    escape: "#ffd700",
    number: "#9ecbff",
    keyword: "#ff9cff",
    test: "#ffb070",
    function: "#9ecbff",
    type: "#ffd700",
    meta: "#c0c0c0",
    quote: "#ffb070",
    identifier: "#ffffff",
  },
};

const hcLight: Theme = {
  id: "hc-light",
  name: "High Contrast Light",
  kind: "hc-light",
  colors: {
    "app.background": "#ffffff",
    "surface.raised": "#ffffff",
    "surface.sunken": "#ffffff",
    "editor.background": "#ffffff",
    "editor.foreground": "#000000",
    "editor.lineHighlight": "#ffffff",
    "editor.lineNumber": "#333333",
    "editor.lineNumberActive": "#000000",
    "editor.bracketMatch": "#dde6ff",
    "sidebar.background": "#ffffff",
    "activityBar.background": "#ffffff",
    "panel.background": "#ffffff",
    "statusBar.background": "#ffffff",
    "statusBar.foreground": "#000000",
    "menu.background": "#ffffff",
    "tab.activeBackground": "#ffffff",
    "tab.inactiveBackground": "#ffffff",
    "border.default": "#000000",
    "text.primary": "#000000",
    "text.secondary": "#262626",
    "text.disabled": "#666666",
    "accent.primary": "#0037a3",
    "accent.foreground": "#ffffff",
    "accent.secondary": "#0050d0",
    "selection.background": "#b9cdff",
    "focus.border": "#0037a3",
    error: "#a10000",
    warning: "#6b4700",
    "warning.background": "#fff3c4",
    success: "#005a20",
    info: "#0037a3",
    "run.background": "#005a20",
    "run.hover": "#00461a",
    "run.foreground": "#ffffff",
    "test.pass": "#005a20",
    "test.fail": "#a10000",
    "stepper.beforeHighlight": "rgba(0, 120, 40, 0.25)",
    "stepper.afterHighlight": "rgba(90, 0, 160, 0.2)",
    "interaction.input": "#000000",
    "interaction.result": "#0037a3",
    "interaction.stderr": "#a10000",
    "problemRegion.border": "#0037a3",
    "problemRegion.background": "rgba(0, 55, 163, 0.06)",
    "metadata.background": "rgba(0, 0, 0, 0.06)",
    "remote.active": "#005a20",
    "remote.disconnected": "#262626",
    shadow: "rgba(0, 0, 0, 0)",
  },
  syntax: {
    comment: "#3d3d3d",
    string: "#005a20",
    escape: "#6b4700",
    number: "#0037a3",
    keyword: "#6a00a8",
    test: "#8f2a00",
    function: "#00267a",
    type: "#6b4700",
    meta: "#3d3d3d",
    quote: "#8f2a00",
    identifier: "#000000",
  },
};

const paper: Theme = {
  id: "paper",
  name: "Paper",
  kind: "light",
  description: "Warm, printed-page tones",
  colors: {
    ...phdLight.colors,
    "app.background": "#f4efe4",
    "surface.raised": "#fbf8f1",
    "surface.sunken": "#ebe4d5",
    "editor.background": "#fbf8f1",
    "editor.foreground": "#2b2620",
    "editor.lineHighlight": "#f3eee2",
    "editor.lineNumber": "#8c8172",
    "editor.lineNumberActive": "#4a4136",
    "editor.bracketMatch": "#eadbbf",
    "sidebar.background": "#efe9dc",
    "activityBar.background": "#e8e0cf",
    "panel.background": "#f4efe4",
    "statusBar.background": "#e8e0cf",
    "statusBar.foreground": "#3d352b",
    "menu.background": "#fbf8f1",
    "tab.activeBackground": "#fbf8f1",
    "tab.inactiveBackground": "#ece5d7",
    "border.default": "#d8cdb8",
    "text.primary": "#2b2620",
    "text.secondary": "#655b4e",
    "text.disabled": "#a59a8a",
    "accent.primary": "#8a4b1f",
    "accent.foreground": "#ffffff",
    "accent.secondary": "#a8683a",
    "selection.background": "#ecd6b8",
    "focus.border": "#a8571f",
    info: "#2c5a8a",
    success: "#1a6638",
    "test.pass": "#1a6638",
    "run.background": "#1a6638",
    "interaction.result": "#2c4f7a",
    "problemRegion.border": "#cfae86",
    "problemRegion.background": "rgba(138, 75, 31, 0.05)",
  },
  syntax: {
    comment: "#6f6555",
    string: "#3f6b1f",
    escape: "#7a5200",
    number: "#2c5a8a",
    keyword: "#7a2f6b",
    test: "#9a3d12",
    function: "#2c4f7a",
    type: "#7a4a00",
    meta: "#756b5c",
    quote: "#9a3d12",
    identifier: "#2b2620",
  },
};

const waterlooMathPink: Theme = {
  id: "waterloo-math-pink",
  name: "Waterloo Math Pink",
  kind: "dark",
  description: "Unofficial community theme",
  unofficial: true,
  colors: {
    ...phdDark.colors,
    "app.background": "#151217",
    "surface.raised": "#1e1a21",
    "surface.sunken": "#100e12",
    "editor.background": "#19161b",
    "editor.foreground": "#ece4ea",
    "editor.lineHighlight": "#221d25",
    "editor.lineNumber": "#76697a",
    "editor.lineNumberActive": "#e3d4de",
    "editor.bracketMatch": "#46283a",
    "sidebar.background": "#171419",
    "activityBar.background": "#121014",
    "panel.background": "#151217",
    "statusBar.background": "#110f13",
    "statusBar.foreground": "#bdb0ba",
    "menu.background": "#211c24",
    "tab.activeBackground": "#19161b",
    "tab.inactiveBackground": "#151217",
    "border.default": "#342b37",
    "text.primary": "#ece4ea",
    "text.secondary": "#ab9fa9",
    "text.disabled": "#655a68",
    "accent.primary": "#e28bb0",
    "accent.foreground": "#1d0f16",
    "accent.secondary": "#c99aae",
    "selection.background": "#4a2a3d",
    "focus.border": "#eda3c3",
    "problemRegion.border": "#7a4562",
    "problemRegion.background": "rgba(226, 139, 176, 0.06)",
    "remote.disconnected": "#ab9fa9",
  },
  syntax: {
    comment: "#948a95",
    string: "#a8d5b0",
    escape: "#e6c88c",
    number: "#9fc2f2",
    keyword: "#ec9ec0",
    test: "#f0b38a",
    function: "#d9b8f0",
    type: "#e9c27a",
    meta: "#968b98",
    quote: "#f0b38a",
    identifier: "#ece4ea",
  },
};

const waterlooBlackGold: Theme = {
  id: "waterloo-black-gold",
  name: "Waterloo Black & Gold",
  kind: "dark",
  description: "Unofficial community theme",
  unofficial: true,
  colors: {
    ...phdDark.colors,
    "app.background": "#0f0f0f",
    "surface.raised": "#191918",
    "surface.sunken": "#0a0a0a",
    "editor.background": "#131313",
    "editor.foreground": "#e8e6e1",
    "editor.lineHighlight": "#1b1b1a",
    "editor.lineNumber": "#6e6b64",
    "editor.lineNumberActive": "#e0c46c",
    "editor.bracketMatch": "#3a3218",
    "sidebar.background": "#121212",
    "activityBar.background": "#0b0b0b",
    "panel.background": "#0f0f0f",
    "statusBar.background": "#0a0a0a",
    "statusBar.foreground": "#bcb8ae",
    "menu.background": "#1a1a19",
    "tab.activeBackground": "#131313",
    "tab.inactiveBackground": "#0f0f0f",
    "border.default": "#2c2b28",
    "text.primary": "#e8e6e1",
    "text.secondary": "#a8a49a",
    "text.disabled": "#5f5c55",
    "accent.primary": "#e3b23c",
    "accent.foreground": "#141005",
    "accent.secondary": "#c9a65a",
    "selection.background": "#3d3417",
    "focus.border": "#f0c75a",
    warning: "#f0c75a",
    "problemRegion.border": "#6e5a24",
    "problemRegion.background": "rgba(227, 178, 60, 0.05)",
    "remote.disconnected": "#a8a49a",
  },
  syntax: {
    comment: "#8a867c",
    string: "#a9cf9a",
    escape: "#e3b23c",
    number: "#9dbbe0",
    keyword: "#e3b23c",
    test: "#f09a62",
    function: "#e8d7a8",
    type: "#d6b86a",
    meta: "#918d83",
    quote: "#f09a62",
    identifier: "#e8e6e1",
  },
};

export const THEMES: Theme[] = [phdLight, phdDark, midnight, paper, hcDark, hcLight, waterlooMathPink, waterlooBlackGold];

export const DEFAULT_LIGHT_THEME = "phd-light";
export const DEFAULT_DARK_THEME = "phd-dark";

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
