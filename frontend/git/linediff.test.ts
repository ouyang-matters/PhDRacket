import { describe, expect, it } from "vitest";
import { lineChanges } from "./linediff";

const base = ["#lang htdp/bsl", "(define (sq x)", "  (* x x))", "", "(sq 3)"].join("\n");

describe("lineChanges", () => {
  it("finds nothing in unchanged text (line endings ignored)", () => {
    expect(lineChanges(base, base)).toEqual([]);
    expect(lineChanges(base.replace(/\n/g, "\r\n"), base)).toEqual([]);
  });

  it("finds added, modified and deleted lines", () => {
    const added = base.replace("(sq 3)", "(sq 3)\n(sq 4)\n(sq 5)");
    expect(lineChanges(base, added)).toEqual([{ kind: "added", from: 6, to: 7 }]);
    const modified = base.replace("  (* x x))", "  (* x x x))");
    expect(lineChanges(base, modified)).toEqual([{ kind: "modified", from: 3, to: 3 }]);
    const deleted = base.replace("\n(define (sq x)\n  (* x x))", "");
    expect(lineChanges(base, deleted)).toEqual([{ kind: "deleted", after: 1 }]);
  });

  it("separates several regions", () => {
    const b = [";; new first line", "#lang htdp/bsl", "(define (sq y)", "  (* x x))", "", "(sq 3)", "(sq 9)"].join("\n");
    expect(lineChanges(base, b)).toEqual([
      { kind: "added", from: 1, to: 1 },
      { kind: "modified", from: 3, to: 3 },
      { kind: "added", from: 7, to: 7 },
    ]);
  });

  it("handles a new file and an emptied file", () => {
    // An empty file has one empty line, which the new text replaces.
    expect(lineChanges("", "a\nb")).toEqual([{ kind: "modified", from: 1, to: 2 }]);
    expect(lineChanges("a\nb", "")).toEqual([{ kind: "modified", from: 1, to: 1 }]);
  });
});
