// Path helpers for the Explorer. Paths come from the backend in the
// platform's own form (backslashes on Windows); comparisons ignore the
// separator, and on Windows also letter case.

const isWindowsPath = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");

function key(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return isWindowsPath(p) ? n.toLowerCase() : n;
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && key(a) === key(b);
}

/** True when `p` is `base` or inside it. */
export function isWithin(p: string, base: string): boolean {
  const k = key(p);
  const b = key(base);
  return k === b || k.startsWith(`${b}/`);
}

/** `p` with its `from` prefix replaced by `to` (for a renamed or moved folder). */
export function rebase(p: string, from: string, to: string): string {
  if (samePath(p, from)) return to;
  const rest = p.replace(/\\/g, "/").slice(from.replace(/\\/g, "/").replace(/\/+$/, "").length + 1);
  const sep = to.includes("\\") ? "\\" : "/";
  return `${to.replace(/[\\/]+$/, "")}${sep}${rest.split("/").join(sep)}`;
}

export function baseName(p: string): string {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;
}

export function parentOf(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i <= 0 ? trimmed : trimmed.slice(0, i);
}

/** `p` relative to `root`, with forward slashes ("" for the root itself). */
export function relativeTo(p: string, root: string): string {
  if (!isWithin(p, root)) return p;
  return p.replace(/\\/g, "/").slice(root.replace(/\\/g, "/").replace(/\/+$/, "").length).replace(/^\/+/, "");
}

/** The extension, lowercased, without the dot ("" if none). */
export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
