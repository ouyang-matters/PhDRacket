import { describe, expect, it } from "vitest";
import { itemPathAt, outline, readData } from "./structure";

const SRC = `#lang htdp/isl
;;; Question 1

;; count-evens : (listof Number) -> Natural
;; counts the even numbers
(define (count-evens xs)
  (local [(define (even-one? x) (even? x))
          (define total 0)]
    (length (filter even-one? xs))))

(define-struct point (x y))
(define origin (make-point 0 0))
(define sq (lambda (n) (* n n)))

(check-expect (count-evens (list 2 1 4)) 2)
(require 2htdp/image)
;; === Question 2 ===
(define msg "a ) in a string ; and a comment")
#;(define hidden 1)
`;

describe("outline", () => {
  const items = outline(SRC);

  it("lists definitions, structures, tests, requires and sections in order", () => {
    expect(items.map((i) => `${i.kind}:${i.name}`)).toEqual([
      "section:Question 1",
      "function:count-evens",
      "struct:point",
      "constant:origin",
      "function:sq",
      "test:(count-evens (list 2 1 4))",
      "require:require",
      "section:Question 2",
      "constant:msg",
    ]);
  });

  it("takes HtDP signatures, parameters, fields, locals and expected values", () => {
    const ce = items.find((i) => i.name === "count-evens")!;
    expect(ce.detail).toBe("(listof Number) -> Natural");
    expect(ce.children.map((c) => `${c.kind}:${c.name}`)).toEqual(["local:even-one?", "local:total"]);
    expect(items.find((i) => i.name === "point")!.children.map((c) => c.name)).toEqual(["x", "y"]);
    expect(items.find((i) => i.name === "sq")!.detail).toBe("(n)");
    expect(items.find((i) => i.kind === "test")!.detail).toBe("→ 2");
    expect(items.find((i) => i.kind === "require")!.detail).toBe("2htdp/image");
    expect(SRC.slice(ce.nameStart, ce.nameEnd)).toBe("count-evens");
  });

  it("finds the item at the cursor, innermost last", () => {
    const at = SRC.indexOf("(even? x)");
    expect(itemPathAt(items, at).map((i) => i.name)).toEqual(["count-evens", "even-one?"]);
  });

  it("tolerates unfinished code", () => {
    expect(outline("#lang racket\n(define (f x)\n  (+ x").map((i) => i.name)).toEqual(["f"]);
    expect(readData("(a ] b) c)").length).toBeGreaterThan(0);
  });
});
