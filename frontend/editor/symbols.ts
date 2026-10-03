// Top-level definitions of a Racket file, found lexically. Used for Go to
// Symbol and Go to Definition within a file. This never decides what a name
// means; it only finds `(define …)` forms at the top level.

import { bracketPairs } from "./sexp";

export interface Definition {
  name: string;
  /** "function", "constant" or "struct". */
  kind: "function" | "constant" | "struct";
  /** Offsets of the whole form. */
  start: number;
  end: number;
  /** Offset of the defined name. */
  nameOffset: number;
}

const HEAD = /^[([]\s*(define-struct|struct|define-values|define-syntax-rule|define-syntax|define)\s+([([]?)\s*([^\s()[\]{}"';`,|]+)/;

export function topLevelDefinitions(text: string): Definition[] {
  const pairs = bracketPairs(text);
  // A pair is top level when no other pair contains it.
  const top: [number, number][] = [];
  let reach = -1;
  for (const p of [...pairs].sort((a, b) => a[0] - b[0])) {
    if (p[0] > reach) {
      top.push(p);
      reach = p[1];
    }
  }
  const out: Definition[] = [];
  for (const [o, c] of top) {
    const m = HEAD.exec(text.slice(o, Math.min(c + 1, o + 400)));
    if (!m) continue;
    const form = m[1];
    const kind = form === "define-struct" || form === "struct" ? "struct" : m[2] ? "function" : "constant";
    out.push({ name: m[3], kind, start: o, end: c + 1, nameOffset: o + m[0].length - m[3].length });
  }
  return out;
}
