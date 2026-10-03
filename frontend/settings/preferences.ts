// Editor and UI preferences. Stored by the backend in the per-user config
// directory; never written into projects or source files.

/** A theme id from frontend/theme/themes.ts, or "system" (light or dark to
 * match the operating system). */
export type ThemeChoice = string;

export type StartupAnimation = "full" | "reduced" | "off";

export interface ComputeHost {
  id: string;
  /** Display name, e.g. "DGX". */
  name: string;
  /** SSH destination: host, user@host or an ~/.ssh/config alias. */
  host: string;
  /** Racket command on the host. */
  racket: string;
}

export interface Preferences {
  /** Active course profile / mode (shared/models/profiles.ts). */
  profile: string;
  theme: ThemeChoice;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  uiScale: number;
  rainbowBrackets: boolean;
  autoClosingBrackets: boolean;
  minimap: boolean;
  autosave: boolean;
  /** Off by default and only meaningful once a formatter exists. */
  formatOnSave: boolean;
  reducedMotion: boolean;
  panelHeight: number;
  /** The sidebar (Explorer and other views) is shown. */
  explorerVisible: boolean;
  explorerWidth: number;
  /** Sidebar view shown when the sidebar is open. */
  sidebarView: string;
  panelVisible: boolean;
  statusBarVisible: boolean;
  menuBarVisible: boolean;
  startupAnimation: StartupAnimation;
  /** User keybindings: command id → key ("" removes the default). */
  keybindings: Record<string, string>;
  /** SSH compute hosts the user configured (frontend/compute). */
  computeHosts: ComputeHost[];
  /** "local" or the id of a compute host. */
  computeTarget: string;
  /** Show maintainer announcements at startup. */
  showAnnouncements: boolean;
  /** Ids of announcements already shown. */
  seenAnnouncements: string[];
  /** Version (Last Updated date) of the Beta Terms of Use the user accepted. */
  termsAccepted: string;
  /** The first-run Setup dialog has been completed. */
  setupDone: boolean;
  /** Ask GitHub for a newer release at startup (nothing is sent but the request). */
  checkForUpdates: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  profile: "waterloo-cs145",
  theme: "system",
  fontFamily: '"Cascadia Code", "JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  fontSize: 14,
  lineHeight: 1.5,
  uiScale: 1,
  rainbowBrackets: false,
  autoClosingBrackets: true,
  minimap: false,
  autosave: false,
  formatOnSave: false,
  reducedMotion: false,
  panelHeight: 260,
  explorerVisible: true,
  explorerWidth: 240,
  sidebarView: "explorer",
  panelVisible: true,
  statusBarVisible: true,
  menuBarVisible: true,
  startupAnimation: "full",
  keybindings: {},
  computeHosts: [],
  computeTarget: "local",
  checkForUpdates: true,
  setupDone: false,
  termsAccepted: "",
  showAnnouncements: true,
  seenAnnouncements: [],
};

export function mergePreferences(stored: unknown): Preferences {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_PREFERENCES };
  const s = stored as Partial<Record<keyof Preferences, unknown>>;
  const out: Preferences = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    if (typeof s[key] === typeof DEFAULT_PREFERENCES[key]) {
      (out as unknown as Record<string, unknown>)[key] = s[key];
    }
  }
  // Theme ids before the theme engine.
  const legacyThemes: Record<string, string> = { light: "phd-light", dark: "phd-dark", "high-contrast": "hc-dark" };
  out.theme = legacyThemes[out.theme] ?? out.theme;
  if (!["full", "reduced", "off"].includes(out.startupAnimation)) out.startupAnimation = "full";
  out.keybindings = {};
  if (s.keybindings && typeof s.keybindings === "object" && !Array.isArray(s.keybindings)) {
    for (const [id, key] of Object.entries(s.keybindings)) if (typeof key === "string") out.keybindings[id] = key;
  }
  out.computeHosts = Array.isArray(s.computeHosts)
    ? s.computeHosts.filter(
        (h): h is ComputeHost =>
          !!h && typeof h === "object" && ["id", "name", "host", "racket"].every((k) => typeof (h as Record<string, unknown>)[k] === "string"),
      )
    : [];
  if (out.computeTarget !== "local" && !out.computeHosts.some((h) => h.id === out.computeTarget)) out.computeTarget = "local";
  out.fontSize = Math.min(Math.max(out.fontSize, 8), 40);
  out.uiScale = Math.min(Math.max(out.uiScale, 0.75), 2);
  return out;
}
