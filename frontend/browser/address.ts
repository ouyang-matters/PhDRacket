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
