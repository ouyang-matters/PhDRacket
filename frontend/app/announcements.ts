// Announcements published by the maintainers in announcements/current.json on
// the repository's main branch. They are display-only: plain text and at most
// one https link. Each announcement is shown once, and the feature can be
// turned off in Settings. See docs/RACKET_INTEGRATION.md.

export interface Announcement {
  /** Unique id; an announcement is shown once per id. */
  id: string;
  title: string;
  /** Plain text. Never interpreted as HTML or Markdown. */
  body: string;
  link?: { label: string; url: string };
  /** Only for app versions in [minVersion, maxVersion]. */
  minVersion?: string;
  maxVersion?: string;
  /** Only for these profile ids (e.g. "waterloo-cs145"). */
  profiles?: string[];
  /** Shown until this date (YYYY-MM-DD, inclusive). */
  until?: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 2000;

/** Compares semantic versions such as 0.1.0 and 0.1.0-beta.2. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number(n) || 0), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1; // a release is newer than its pre-releases
  if (y.pre === null) return -1;
  const xp = x.pre.split(".");
  const yp = y.pre.split(".");
  for (let i = 0; i < Math.max(xp.length, yp.length); i++) {
    if (xp[i] === undefined) return -1;
    if (yp[i] === undefined) return 1;
    const xn = Number(xp[i]);
    const yn = Number(yp[i]);
    const d = !isNaN(xn) && !isNaN(yn) ? xn - yn : xp[i].localeCompare(yp[i]);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** Validates untrusted JSON; drops anything malformed. */
export function parseAnnouncements(json: string): Announcement[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const list = (data as { announcements?: unknown })?.announcements;
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const out: Announcement[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const title = str(r.title);
    const body = str(r.body);
    if (!id || !title || !body) continue;
    const a: Announcement = { id, title: title.slice(0, MAX_TITLE), body: body.slice(0, MAX_BODY) };
    const link = r.link as Record<string, unknown> | undefined;
    const url = str(link?.url);
    if (url && /^https:\/\/[^\s]+$/.test(url)) a.link = { label: str(link?.label)?.slice(0, 60) || url, url };
    a.minVersion = str(r.minVersion);
    a.maxVersion = str(r.maxVersion);
    a.until = /^\d{4}-\d{2}-\d{2}$/.test(str(r.until) ?? "") ? str(r.until) : undefined;
    if (Array.isArray(r.profiles)) a.profiles = r.profiles.filter((p): p is string => typeof p === "string");
    out.push(a);
  }
  return out;
}

/** The announcements to show now, oldest first. */
export function pendingAnnouncements(
  list: Announcement[],
  ctx: { version: string; profile: string; today: string; seen: string[] },
): Announcement[] {
  return list.filter(
    (a) =>
      !ctx.seen.includes(a.id) &&
      (!a.minVersion || compareVersions(ctx.version, a.minVersion) >= 0) &&
      (!a.maxVersion || compareVersions(ctx.version, a.maxVersion) <= 0) &&
      (!a.profiles || a.profiles.includes(ctx.profile)) &&
      (!a.until || ctx.today <= a.until),
  );
}

export function todayString(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
