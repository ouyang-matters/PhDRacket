// Conversion of Racket source locations to editor ranges.
//
// Racket counts positions and columns in characters (Unicode code points);
// the editor counts UTF-16 code units. A Racket position is 1-based, a
// column 0-based; editor lines and columns are both 1-based. The editor text
// is LF-normalized, and Racket's line counting treats CRLF as one position,
// so offsets agree for files with either line-ending style.

import type { Srcloc } from "@shared/protocol";

export interface EditorRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** UTF-16 offset of the code point at `cp` (0-based) in `text`. */
export function codePointToUtf16(text: string, cp: number): number {
  let units = 0;
  let seen = 0;
  for (const ch of text) {
    if (seen === cp) return units;
    units += ch.length;
    seen++;
  }
  return units;
}

function positionOf(text: string, utf16: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < utf16 && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: utf16 - lineStart + 1 };
}

/** Editor range for a srcloc in `text`, or null if it cannot be placed. */
export function srclocToRange(text: string, loc: Srcloc): EditorRange | null {
  if (loc.position != null && loc.position >= 1) {
    const startCp = loc.position - 1;
    const span = Math.max(loc.span ?? 0, 0);
    const start = positionOf(text, codePointToUtf16(text, startCp));
    const end = positionOf(text, codePointToUtf16(text, startCp + Math.max(span, 1)));
    return {
      startLineNumber: start.line,
      startColumn: start.column,
      endLineNumber: end.line,
      endColumn: end.column,
    };
  }
  if (loc.line != null && loc.line >= 1) {
    const lines = text.split("\n");
    const lineText = lines[loc.line - 1] ?? "";
    const col = codePointToUtf16(lineText, loc.column ?? 0) + 1;
    return {
      startLineNumber: loc.line,
      startColumn: col,
      endLineNumber: loc.line,
      endColumn: Math.max(col + 1, lineText.length + 1),
    };
  }
  return null;
}

/** Whether a srcloc's source refers to the given file path. */
export function sameSourcePath(source: string | null, path: string | null): boolean {
  if (!source || !path) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/\.\//g, "/");
  const a = norm(source);
  const b = norm(path);
  // Windows paths are case-insensitive.
  return /^[a-zA-Z]:\//.test(b) ? a.toLowerCase() === b.toLowerCase() : a === b;
}
