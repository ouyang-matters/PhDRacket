// Turning what the student typed into a web address.

/** "student.cs.uwaterloo.ca/~cs145" → "https://student.cs.uwaterloo.ca/~cs145".
 * Returns null for anything that is not a web address. */
export function toWebAddress(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return validUrl(t);
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^localhost:\d/i.test(t) && !/^[\w.-]+:\d+/.test(t)) return null;
  const host = t.split(/[/?#]/)[0];
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  if (!local && !/^[\w-]+(\.[\w-]+)+(:\d+)?$/.test(host)) return null;
  return validUrl(`${local ? "http" : "https"}://${t}`);
}

function validUrl(s: string): string | null {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Files from this computer (apps/desktop/src-tauri/src/local_files.rs)

/** A file path or file:// address: "C:\\Exams\\q1.pdf", "/Users/me/q1.pdf",
 * "\\\\server\\share\\notes.html", "file:///C:/q1.pdf". */
export function isLocalFileInput(text: string): boolean {
  const t = text.trim();
  return /^file:/i.test(t) || /^[a-z]:[\\/]/i.test(t) || /^\\\\[^\\]/.test(t) || /^\/[^/]/.test(t);
}

/** Files shown in a browser tab when opened (they are not text to edit). */
const VIEWED = /\.(pdf|png|jpe?g|gif|webp|bmp|svg|ico|mp4|webm|mp3|wav)$/i;

export function opensInBrowserTab(path: string): boolean {
  return VIEWED.test(path);
}

const LOCAL = /^(?:phdfile:\/\/localhost|http:\/\/phdfile\.localhost)(\/[^?#]*)/i;

/** True for the address of a local file shown in a browser tab. */
export function isLocalFileAddress(url: string): boolean {
  return LOCAL.test(url);
}

/** What the address bar shows: a local file's path rather than its internal
 * address ("C:\\Exams\\q1.pdf" on Windows, "/Users/me/q1.pdf" elsewhere). */
export function displayAddress(url: string): string {
  const m = LOCAL.exec(url);
  if (!m) return url;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return url;
  }
  return /^\/[a-z]:\//i.test(path) ? path.slice(1).replace(/\//g, "\\") : path;
}

/** The file name, for a tab's title. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
