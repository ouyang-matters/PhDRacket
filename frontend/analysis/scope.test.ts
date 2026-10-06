import { describe, expect, it } from "vitest";
import type { CheckResult } from "@shared/protocol";
import { analyze, bindingAt, candidates, cpConverter, topLevelForms, validIdentifier } from "./scope";

// "#lang htdp/bsl\n(define (sq x)\n  (* x x))\n(define (f n)\n  (+ (sq n) 1))\n(f 3)\n"
const text = "#lang htdp/bsl\n(define (sq x)\n  (* x x))\n(define (f n)\n  (+ (sq n) 1))\n(f 3)\n";
const result: CheckResult = {
  diagnostics: [],
  arrows: [
    { from: [27, 28], to: [37, 38] },
    { from: [27, 28], to: [35, 36] },
    { from: [52, 53], to: [64, 65] },
    { from: [24, 26], to: [61, 63] },
    { from: [50, 51], to: [72, 73] },
  ],
  definitions: [
    { from: [24, 26], name: "sq" },
    { from: [50, 51], name: "f" },
    { from: [24, 26], name: "sq.1" },
  ],
  unused: [[50, 51]],
};

describe("analysis helpers", () => {
  it("groups uses under their binding", () => {
    const a = analyze(result, text);
    const x = bindingAt(a, 35)!;
    expect(x.site).toEqual([27, 28]);
    expect(x.uses).toHaveLength(2);
    expect(bindingAt(a, 62)!.site).toEqual([24, 26]);
    expect(a.definitions.map((d) => d.name)).toEqual(["sq", "f"]);
    // A module-level definition is not reported as unused.
    expect(a.unused).toEqual([]);
  });

  it("finds top-level forms, ignoring brackets in strings and comments", () => {
    expect(topLevelForms('(a "(")\n; (\n(b #\\( [c])')).toEqual([
      [0, 7],
      [12, 23],
    ]);
  });

  it("suggests definitions, locals in the same form, then language names", () => {
    const a = analyze(result, text);
    const inSq = candidates(a, [{ name: "sqrt", kind: "value" }, { name: "define", kind: "syntax" }], text, 38);
    expect(inSq.map((c) => `${c.name}:${c.kind}`)).toEqual(["sq:definition", "f:definition", "x:local", "sqrt:value", "define:syntax"]);
    const atEnd = candidates(a, [], text, text.length);
    expect(atEnd.some((c) => c.name === "x")).toBe(false);
  });

  it("converts code point offsets when the text has astral characters", () => {
    const cv = cpConverter("a😀b");
    expect([cv(0), cv(1), cv(2), cv(3)]).toEqual([0, 1, 3, 4]);
  });

  it("validates new names for Rename", () => {
    expect(validIdentifier("count-evens")).toBe(true);
    expect(validIdentifier("list->string?")).toBe(true);
    for (const bad of ["", "a b", "(x", "12", "#x"]) expect(validIdentifier(bad), bad).toBe(false);
  });
});
