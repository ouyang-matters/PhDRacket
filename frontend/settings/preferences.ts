// Editor and UI preferences. Stored by the backend in the per-user config
// directory; never written into projects or source files.

export type ThemeChoice = "system" | "light" | "dark" | "high-contrast";

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
  explorerVisible: boolean;
  explorerWidth: number;
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
  out.fontSize = Math.min(Math.max(out.fontSize, 8), 40);
  out.uiScale = Math.min(Math.max(out.uiScale, 0.75), 2);
  return out;
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" | "high-contrast" {
  if (choice !== "system") return choice;
  const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function monacoThemeFor(resolved: "light" | "dark" | "high-contrast"): string {
  return resolved === "dark" ? "phd-dark" : resolved === "high-contrast" ? "hc-black" : "phd-light";
}
