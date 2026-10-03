import { describe, expect, it } from "vitest";
import { isCompleteEntry, scan } from "./sexp";

describe("scan", () => {
  it("ignores delimiters in strings, comments and character literals", () => {
    expect(scan('(display "(")').unclosed).toEqual([]);
    expect(scan("(f #\\( #\\))").unclosed).toEqual([]);
    expect(scan("(f ; )\n 1)").unclosed).toEqual([]);
    expect(scan("(f #| ) #| ) |# |# 1)").unclosed).toEqual([]);
    expect(scan("(|a)b| 1)").unclosed).toEqual([]);
  });

  it("reports unclosed and mismatched delimiters", () => {
    expect(scan("(define (f x)").unclosed.map((d) => d.offset)).toEqual([0]);
    const r = scan("(f [x)");
    expect(r.mismatched).toHaveLength(1);
    expect(r.mismatched[0].close.char).toBe(")");
  });
});

describe("isCompleteEntry", () => {
  it.each([
    ["(+ 1 2)", true],
    ["x", true],
    ["(+ 1", false],
    ['"abc', false],
    ["#| open", false],
    ["; only a comment", false],
    ["   ", false],
    ["(+ 1 2))", true],
    ["(f [x)", true],
  ])("%s → %s", (text, expected) => {
    expect(isCompleteEntry(text)).toBe(expected);
  });
});
