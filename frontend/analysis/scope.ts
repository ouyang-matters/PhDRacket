// Pure helpers over a Check Syntax result (frontend/analysis/analysis.ts):
// offsets, bindings and their uses, and suggestion candidates. Offsets here
// are UTF-16 offsets into the editor's text (converted from Racket's code
// point offsets once, when a result arrives).

import type { CheckResult, CpRange } from "@shared/protocol";

export type Range16 = [number, number];

export interface Binding {
  /** Where the name is bound. */
  site: Range16;
  uses: Range16[];
}

export interface Analysis {
  bindings: Binding[];
  hovers: { range: Range16; text: string }[];
  docs: { range: Range16; label: string; url: string }[];
  /** Module-level definitions (deduplicated by site). */
  definitions: { range: Range16; name: string }[];
  /** Local bindings that are never used (module-level definitions excluded). */
  unused: Range16[];
}

/** Converts code point offsets to UTF-16 offsets for `text`. */
export function cpConverter(text: string): (cp: number) => number {
  if (!/[\uD800-\uDFFF]/.test(text)) return (cp) => cp;
  const map: number[] = [];
  let u = 0;
  for (const ch of text) {
    map.push(u);
    u += ch.length;
  }
  map.push(u);
  return (cp) => map[Math.min(Math.max(cp, 0), map.length - 1)];
}

const same = (a: Range16, b: Range16) => a[0] === b[0] && a[1] === b[1];
export const contains = (r: Range16, offset: number) => r[0] <= offset && offset <= r[1];

export function analyze(result: CheckResult, text: string): Analysis {
  const cv = cpConverter(text);
  const r = (x: CpRange): Range16 => [cv(x[0]), cv(x[1])];
  const bindings: Binding[] = [];
  for (const a of result.arrows ?? []) {
    const site = r(a.from);
    const use = r(a.to);
    const b = bindings.find((x) => same(x.site, site));
    if (b) {
      if (!b.uses.some((u) => same(u, use))) b.uses.push(use);
    } else bindings.push({ site, uses: [use] });
  }
  const definitions: Analysis["definitions"] = [];
  for (const d of result.definitions ?? []) {
    const range = r(d.from);
    // Check Syntax also lists renamed copies ("f.1") at the same site.
    if (!definitions.some((x) => same(x.range, range))) definitions.push({ range, name: d.name });
  }
  const unused = (result.unused ?? []).map(r).filter((u) => !definitions.some((d) => same(d.range, u)));
  return {
    bindings,
    hovers: (result.hovers ?? []).map((h) => ({ range: r(h.from), text: h.text })),
    docs: (result.docs ?? []).map((d) => ({ range: r(d.from), label: d.label, url: d.url })),
    definitions,
    unused,
  };
}

/** The binding whose site or one of whose uses is at `offset`. */
export function bindingAt(a: Analysis, offset: number): Binding | null {
  return (
    a.bindings.find((b) => contains(b.site, offset)) ??
    a.bindings.find((b) => b.uses.some((u) => contains(u, offset))) ??
    // A definition without uses is still its own binding.
    (() => {
      const d = a.definitions.find((x) => contains(x.range, offset));
      return d ? { site: d.range, uses: [] } : null;
    })()
  );
}

/** The narrowest range containing `offset` among `ranges`. */
export function narrowest<T extends { range: Range16 }>(items: T[], offset: number): T[] {
  const hits = items.filter((i) => contains(i.range, offset));
  if (hits.length === 0) return [];
  const w = Math.min(...hits.map((h) => h.range[1] - h.range[0]));
  return hits.filter((h) => h.range[1] - h.range[0] === w);
}

/** [start, end) of each top-level form, skipping strings and comments. */
export function topLevelForms(text: string): Range16[] {
  const out: Range16[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ";") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    } else if (c === "#" && text[i + 1] === "|") {
      const end = text.indexOf("|#", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === "#" && text[i + 1] === "\\") {
      i += 2;
    } else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ")" || c === "]" || c === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0) out.push([start, i + 1]);
      }
    }
  }
  if (depth > 0) out.push([start, text.length]);
  return out;
}

export interface Candidate {
  name: string;
  kind: "definition" | "local" | "value" | "syntax";
}

/** Names to suggest at `offset`: the program's definitions, local names bound
 * in the same top-level form, then the language's names. */
export function candidates(a: Analysis | null, exports: { name: string; kind: "value" | "syntax" }[], text: string, offset: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const add = (name: string, kind: Candidate["kind"]) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, kind });
  };
  if (a) {
    for (const d of a.definitions) add(text.slice(d.range[0], d.range[1]) || d.name, "definition");
    const form = topLevelForms(text).find((f) => f[0] <= offset && offset <= f[1]);
    if (form) {
      for (const b of a.bindings) {
        if (b.site[0] >= form[0] && b.site[1] <= form[1] && b.site[1] <= offset) add(text.slice(b.site[0], b.site[1]), "local");
      }
    }
  }
  for (const e of exports) add(e.name, e.kind);
  return out;
}

/** A valid Racket identifier for Rename (no delimiters or whitespace). */
export function validIdentifier(name: string): boolean {
  return name.length > 0 && !/[\s()[\]{}",'`;|]/.test(name) && !/^#/.test(name) && Number.isNaN(Number(name));
}
