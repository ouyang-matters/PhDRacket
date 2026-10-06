// The structure of a Racket source file for the Outline: definitions (with
// their parameters and HtDP signatures), structures and their fields, local
// definitions, tests, requires and section comments. This is a lexical
// reading of the text, fast enough to redo on every keystroke; it never
// decides what a program means (frontend/analysis does that, with Racket).

export type ItemKind = "function" | "constant" | "struct" | "field" | "local" | "test" | "require" | "provide" | "section";

export interface OutlineItem {
  name: string;
  kind: ItemKind;
  /** Parameters, a signature, or what a test expects. */
  detail?: string;
  /** Offsets (UTF-16) of the whole form, and of the name. */
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  children: OutlineItem[];
}

interface Datum {
  start: number;
  end: number;
  /** Lists: their elements (prefix quotes are skipped). */
  items?: Datum[];
}

const DELIM = /[\s()[\]{}";'`,]/;

/** Reads every datum of `text`, tolerating unbalanced brackets. */
export function readData(text: string): Datum[] {
  let i = 0;
  const n = text.length;

  function skipAtmosphere() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] === ";") {
        while (i < n && text[i] !== "\n") i++;
      } else if (text[i] === "#" && text[i + 1] === "|") {
        let depth = 1;
        i += 2;
        while (i < n && depth > 0) {
          if (text[i] === "|" && text[i + 1] === "#") (depth--, (i += 2));
          else if (text[i] === "#" && text[i + 1] === "|") (depth++, (i += 2));
          else i++;
        }
      } else if (text[i] === "#" && text[i + 1] === ";") {
        i += 2;
        read();
      } else return;
    }
  }

  function read(): Datum | null {
    skipAtmosphere();
    if (i >= n) return null;
    const start = i;
    const c = text[i];
    if (c === "'" || c === "`" || c === ",") {
      i += text[i + 1] === "@" ? 2 : 1;
      const d = read();
      return d ? { start, end: d.end, items: d.items } : null;
    }
    if (c === "#" && (text[i + 1] === "'" || text[i + 1] === "`" || text[i + 1] === ",")) {
      i += 2;
      const d = read();
      return d ? { start, end: d.end, items: d.items } : null;
    }
    if (c === "(" || c === "[" || c === "{" || (c === "#" && /[([{]/.test(text[i + 1] ?? ""))) {
      i += c === "#" ? 2 : 1;
      const items: Datum[] = [];
      for (;;) {
        skipAtmosphere();
        if (i >= n) return { start, end: n, items };
        if (/[)\]}]/.test(text[i])) {
          i++;
          return { start, end: i, items };
        }
        const d = read();
        if (!d) return { start, end: i, items };
        items.push(d);
      }
    }
    if (/[)\]}]/.test(c)) {
      // A stray closer: skip it.
      i++;
      return read();
    }
    if (c === '"') {
      i++;
      while (i < n && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      i = Math.min(i + 1, n);
      return { start, end: i };
    }
    if (c === "#" && text[i + 1] === "\\") {
      i += 3;
      while (i < n && !DELIM.test(text[i])) i++;
      return { start, end: i };
    }
    if (c === "|") {
      i++;
      while (i < n && text[i] !== "|") i++;
      i = Math.min(i + 1, n);
      return { start, end: i };
    }
    while (i < n && !DELIM.test(text[i])) i++;
    if (i === start) i++;
    return { start, end: i };
  }

  const out: Datum[] = [];
  for (;;) {
    const d = read();
    if (!d) return out;
    out.push(d);
  }
}

const DEFINE = new Set(["define", "define-values", "define-syntax", "define-syntax-rule"]);
const STRUCT = new Set(["define-struct", "struct"]);
const TESTS = new Set([
  "check-expect", "check-within", "check-error", "check-member-of", "check-range", "check-satisfied", "check-random",
  "check-equal?", "check-true", "check-false", "test-case", "check-property",
]);
const LAMBDA = new Set(["lambda", "λ", "case-lambda"]);

function atom(text: string, d: Datum | undefined): string | null {
  return d && !d.items ? text.slice(d.start, d.end) : null;
}

function oneLine(text: string, d: Datum | undefined, max = 48): string {
  if (!d) return "";
  const s = text.slice(d.start, d.end).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The HtDP signature in the comments just above `offset`, for `name`. */
function signatureAbove(text: string, offset: number, name: string): string | undefined {
  const before = text.slice(Math.max(0, offset - 600), offset).split("\n");
  before.pop(); // the definition's own line
  for (let k = before.length - 1; k >= 0 && k >= before.length - 6; k--) {
    const line = before[k].trim();
    if (!line.startsWith(";")) break;
    const m = /^;+\s*([^\s:]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (m && m[1] === name && /->|→/.test(m[2])) return m[2];
  }
  return undefined;
}

function localDefinitions(text: string, body: Datum[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const d of body) {
    if (!d.items) continue;
    const head = atom(text, d.items[0]);
    if (head && DEFINE.has(head)) {
      const item = definition(text, d, "local");
      if (item) out.push(item);
    } else if (head === "local" && d.items[1]?.items) {
      out.push(...localDefinitions(text, d.items[1].items));
      out.push(...localDefinitions(text, d.items.slice(2)));
    } else {
      out.push(...localDefinitions(text, d.items));
    }
  }
  return out;
}

function definition(text: string, d: Datum, as: "top" | "local"): OutlineItem | null {
  const [, target, value, ...rest] = d.items!;
  if (!target) return null;
  if (target.items) {
    // (define (name param ...) body ...), also curried (define ((f a) b) ...)
    let head = target;
    while (head.items && head.items[0]?.items) head = head.items[0];
    const nameD = head.items?.[0];
    const name = atom(text, nameD);
    if (!name || !nameD) return null;
    const params = target.items.slice(1).map((p) => oneLine(text, p, 20)).join(" ");
    return {
      name,
      kind: as === "local" ? "local" : "function",
      detail: params,
      start: d.start,
      end: d.end,
      nameStart: nameD.start,
      nameEnd: nameD.end,
      children: localDefinitions(text, [value, ...rest].filter(Boolean) as Datum[]),
    };
  }
  const name = atom(text, target);
  if (!name) return null;
  const isLambda = !!value?.items && LAMBDA.has(atom(text, value.items[0]) ?? "");
  return {
    name,
    kind: as === "local" ? "local" : isLambda ? "function" : "constant",
    detail: isLambda ? value!.items!.slice(1, 2).map((p) => oneLine(text, p, 30)).join("") : undefined,
    start: d.start,
    end: d.end,
    nameStart: target.start,
    nameEnd: target.end,
    children: value ? localDefinitions(text, [value]) : [],
  };
}

/** Section headings: `;;; Title`, `;; === Title ===`, `;; --- Title ---`. */
function sections(text: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  const re = /^[ \t]*(?:;;;+[ \t]*([^;\n].*?)|;;+[ \t]*[=*-]{3,}[ \t]*(\S.*?)[ \t]*[=*-]*)[ \t]*$/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const title = (m[1] ?? m[2] ?? "").replace(/[=*-]+$/, "").trim();
    if (!title) continue;
    out.push({ name: title, kind: "section", start: m.index, end: m.index + m[0].length, nameStart: m.index, nameEnd: m.index + m[0].length, children: [] });
  }
  return out;
}

export function outline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const d of readData(text)) {
    if (!d.items || d.items.length === 0) continue;
    const head = atom(text, d.items[0]);
    if (!head) continue;
    if (DEFINE.has(head)) {
      const item = definition(text, d, "top");
      if (item) {
        const sig = signatureAbove(text, d.start, item.name);
        if (sig) item.detail = sig;
        items.push(item);
      }
    } else if (STRUCT.has(head)) {
      const nameD = d.items[1];
      const name = atom(text, nameD);
      if (!name || !nameD) continue;
      const fieldsD = d.items.find((x, k) => k >= 2 && x.items);
      items.push({
        name,
        kind: "struct",
        start: d.start,
        end: d.end,
        nameStart: nameD.start,
        nameEnd: nameD.end,
        children: (fieldsD?.items ?? []).map((f) => {
          const fd = f.items ? f.items[0] : f;
          return { name: oneLine(text, fd, 30), kind: "field" as const, start: f.start, end: f.end, nameStart: fd.start, nameEnd: fd.end, children: [] };
        }),
      });
    } else if (TESTS.has(head)) {
      items.push({
        name: oneLine(text, d.items[1]) || head,
        kind: "test",
        detail: d.items[2] ? `→ ${oneLine(text, d.items[2], 30)}` : head,
        start: d.start,
        end: d.end,
        nameStart: d.items[0].start,
        nameEnd: d.items[0].end,
        children: [],
      });
    } else if (head === "require" || head === "provide") {
      items.push({
        name: head,
        kind: head,
        detail: d.items.slice(1).map((x) => oneLine(text, x, 30)).join(" "),
        start: d.start,
        end: d.end,
        nameStart: d.items[0].start,
        nameEnd: d.items[0].end,
        children: [],
      });
    }
  }
  return [...items, ...sections(text)].sort((a, b) => a.start - b.start);
}

/** The innermost item containing `offset` (with the path to it). */
export function itemPathAt(items: OutlineItem[], offset: number): OutlineItem[] {
  for (const it of items) {
    if (it.kind !== "section" && it.start <= offset && offset <= it.end) return [it, ...itemPathAt(it.children, offset)];
  }
  return [];
}
