import { describe, expect, it } from "vitest";
import { codePointToUtf16, sameSourcePath, srclocToRange } from "./srcloc";

const loc = (position: number | null, span: number | null, line: number | null = null, column: number | null = null) => ({
  source: null,
  position,
  span,
  line,
  column,
});

describe("srclocToRange", () => {
  it("maps 1-based character positions", () => {
    const text = "(define x 1)\n(f x)";
    // "(f x)" starts at character 14 (1-based).
    expect(srclocToRange(text, loc(14, 5))).toEqual({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 6,
    });
  });

  it("counts astral characters as one Racket position", () => {
    const text = '"🙂" (f x)';
    // Racket: " 🙂 " space ( => "(" is character 5 (1-based).
    expect(codePointToUtf16(text, 4)).toBe(5);
    expect(srclocToRange(text, loc(5, 5))).toMatchObject({ startColumn: 6, endColumn: 11 });
  });

  it("falls back to line/column", () => {
    expect(srclocToRange("a\nbcd", loc(null, null, 2, 1))).toMatchObject({
      startLineNumber: 2,
      startColumn: 2,
    });
  });
});

describe("sameSourcePath", () => {
  it("compares Windows paths case-insensitively", () => {
    expect(sameSourcePath("C:\\Course\\A3.rkt", "c:/course/a3.rkt")).toBe(true);
    expect(sameSourcePath("/home/a/A3.rkt", "/home/a/a3.rkt")).toBe(false);
  });
});
