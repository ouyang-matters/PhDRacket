// Which files the Explorer hides (Settings > Files). Patterns are a small
// subset of .gitignore:
//
//   *.zo        a name pattern: matches the entry's name anywhere
//   compiled/   a trailing slash: folders only
//   docs/*.pdf  a slash inside: matched against the path from the open folder
//
// `*` matches any run of characters except "/", `?` one character. Matching
// ignores letter case. Only the Explorer applies these; Quick Open and
// Search are unaffected.

export interface HiddenPreset {
  id: string;
  label: string;
  patterns: string[];
}

export const HIDDEN_PRESETS: HiddenPreset[] = [
  { id: "racket-build", label: "Racket build output (compiled/, .zo, .dep)", patterns: ["compiled/", "*.zo", "*.dep"] },
  { id: "backups", label: "Backup files (*~, *.bak, #*#)", patterns: ["*~", "*.bak", "#*#"] },
  { id: "dotfiles", label: "Dot files and folders (.git, .vscode, …)", patterns: [".*"] },
  { id: "system", label: "System files (Thumbs.db, desktop.ini, .DS_Store)", patterns: ["Thumbs.db", "desktop.ini", ".DS_Store"] },
  { id: "tools", label: "Tool folders (node_modules/, target/)", patterns: ["node_modules/", "target/"] },
];

/** What the Explorer hid before hiding was configurable. */
export const DEFAULT_HIDDEN = ["compiled/", "*.zo", "*.dep", ".*", "Thumbs.db", "desktop.ini", ".DS_Store", "node_modules/", "target/"];

export function presetEnabled(patterns: string[], preset: HiddenPreset): boolean {
  return preset.patterns.every((p) => patterns.includes(p));
}

export function setPreset(patterns: string[], preset: HiddenPreset, on: boolean): string[] {
  const rest = patterns.filter((p) => !preset.patterns.includes(p));
  return on ? [...rest, ...preset.patterns] : rest;
}

/** Patterns not covered by an enabled preset, for the custom list. */
export function customPatterns(patterns: string[]): string[] {
  const inPresets = new Set(HIDDEN_PRESETS.flatMap((p) => p.patterns));
  return patterns.filter((p) => !inPresets.has(p));
}

/** Cleans user input: one pattern per line or comma, no blanks or duplicates. */
export function parsePatterns(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const p = raw.trim().replace(/\\/g, "/");
    if (p && !p.startsWith("!") && !out.includes(p)) out.push(p);
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (const ch of glob) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export interface HiddenMatcher {
  (relativePath: string, isDir: boolean): boolean;
}

/** Compiles patterns once; the matcher takes the path from the open folder. */
export function hiddenMatcher(patterns: string[]): HiddenMatcher {
  const rules = patterns
    .map((p) => p.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .map((p) => {
      const dirOnly = p.endsWith("/");
      const body = p.replace(/^\/+|\/+$/g, "");
      return { dirOnly, anchored: body.includes("/"), re: globToRegExp(body) };
    });
  return (rel, isDir) => {
    const path = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    const name = path.split("/").pop() ?? path;
    return rules.some((r) => (!r.dirOnly || isDir) && r.re.test(r.anchored ? path : name));
  };
}
