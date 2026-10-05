import { describe, expect, it } from "vitest";
import { toWebAddress } from "./address";

describe("toWebAddress", () => {
  it("adds https to bare addresses", () => {
    expect(toWebAddress("student.cs.uwaterloo.ca/~cs145")).toBe("https://student.cs.uwaterloo.ca/~cs145");
    expect(toWebAddress("docs.racket-lang.org")).toBe("https://docs.racket-lang.org/");
    expect(toWebAddress("https://learn.uwaterloo.ca/d2l/home")).toBe("https://learn.uwaterloo.ca/d2l/home");
  });

  it("uses http for this computer", () => {
    expect(toWebAddress("localhost:8000/a.html")).toBe("http://localhost:8000/a.html");
    expect(toWebAddress("127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
  });

  it("refuses what is not a web page", () => {
    for (const bad of ["", "racket lists", "file:///C:/a.rkt", "javascript:alert(1)", "mailto:a@b.c", "hello"]) {
      expect(toWebAddress(bad), bad).toBe(null);
    }
  });
});
