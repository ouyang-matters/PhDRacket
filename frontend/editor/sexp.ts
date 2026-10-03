// A small lexical scanner for Racket text, used only for editor mechanics
// (deciding whether an Interactions entry is complete, delimiter checks).
// It never decides what a program means: Racket's reader does that when the
// text is evaluated, and any disagreement surfaces as Racket's own error.

export interface Delimiter {
  char: string;
  offset: number;
}

export interface ScanResult {
  /** Opening delimiters that were never closed, outermost first. */
  unclosed: Delimiter[];
  /** Closing delimiters with no matching opener, or the wrong shape. */
  mismatched: { close: Delimiter; open: Delimiter | null }[];
  inString: boolean;
  inBlockComment: boolean;
  /** True if anything other than whitespace and comments was seen. */
  hasContent: boolean;
}

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const DELIMS = new Set([..."()[]{}\",'`; \t\n\r"]);

export function scan(text: string): ScanResult {
  const stack: Delimiter[] = [];
  const mismatched: ScanResult["mismatched"] = [];
  let i = 0;
  let inString = false;
  let blockDepth = 0;
  let hasContent = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (blockDepth > 0) {
      if (c === "|" && text[i + 1] === "#") {
        blockDepth--;
        i += 2;
      } else if (c === "#" && text[i + 1] === "|") {
        blockDepth++;
        i += 2;
      } else i++;
      continue;
    }
    if (inString) {
      if (c === "\\") i += 2;
      else {
        if (c === '"') inString = false;
        i++;
      }
      continue;
    }
    if (c === ";") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "#" && text[i + 1] === "|") {
      blockDepth = 1;
      i += 2;
      continue;
    }
    if (c === "#" && text[i + 1] === "\\") {
      // Character literal: #\( is a character, not a delimiter.
      hasContent = true;
      i += 3;
      while (i < n && !DELIMS.has(text[i])) i++;
      continue;
    }
    if (c === "|") {
      // |quoted symbol|
      hasContent = true;
      i++;
      while (i < n && text[i] !== "|") i++;
      i++;
      continue;
    }
    if (c === '"') {
      hasContent = true;
      inString = true;
      i++;
      continue;
    }
    if (c in OPEN) {
      hasContent = true;
      stack.push({ char: c, offset: i });
    } else if (c in CLOSE) {
      hasContent = true;
      const top = stack[stack.length - 1];
      if (top && top.char === CLOSE[c]) stack.pop();
      else mismatched.push({ close: { char: c, offset: i }, open: top ?? null });
    } else if (!/\s/.test(c)) {
      hasContent = true;
    }
    i++;
  }
  return { unclosed: stack, mismatched, inString, inBlockComment: blockDepth > 0, hasContent };
}

/** Whether an Interactions entry looks ready to submit (like DrRacket's
 * Enter-at-end behavior). Mismatched delimiters are submitted so Racket can
 * report the read error. */
export function isCompleteEntry(text: string): boolean {
  const r = scan(text);
  if (!r.hasContent) return false;
  if (r.mismatched.length > 0) return true;
  return r.unclosed.length === 0 && !r.inString && !r.inBlockComment;
}
