import { describe, expect, it } from "vitest";
import { bracketPairs, enclosingSexp } from "./sexp";
import { topLevelDefinitions } from "./symbols";

const SRC = `;; (not code)
(define (f x)
  (cond [(empty? x) "(" ]
        [else (+ 1 (f (rest x)))]))
(define-struct pt (x y))
(define g 10)
#| (define hidden 1) |#
(check-expect (f empty) 0)`;

describe("structural helpers", () => {
  it("pairs delimiters outside strings and comments", () => {
    // A string, a character literal #\( and a comment hide their delimiters.
    const text = '(a "(" #\\( ; )\n [b])';
    expect(bracketPairs(text)).toEqual([
      [text.indexOf("["), text.indexOf("]")],
      [0, text.length - 1],
    ]);
  });

  it("expands to the contents, then the whole enclosing form", () => {
    const at = SRC.indexOf("rest x");
    const inner = enclosingSexp(SRC, at, at);
    expect(SRC.slice(...inner!)).toBe("rest x");
    const form = enclosingSexp(SRC, ...inner!);
    expect(SRC.slice(...form!)).toBe("(rest x)");
    const next = enclosingSexp(SRC, ...form!);
    expect(SRC.slice(...next!)).toBe("f (rest x)");
  });

  it("finds top-level definitions only", () => {
    expect(topLevelDefinitions(SRC).map((d) => [d.name, d.kind])).toEqual([
      ["f", "function"],
      ["pt", "struct"],
      ["g", "constant"],
    ]);
    const f = topLevelDefinitions(SRC)[0];
    expect(SRC.slice(f.nameOffset, f.nameOffset + 1)).toBe("f");
  });
});
