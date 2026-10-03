import { describe, expect, it } from "vitest";
import { applyLineEdit, currentLanguageId, languageChangeEdit } from "./change-language";
import { newFileText } from "./new-file";

const body = ";; my program\n(define x 1)\nx\n";
const change = (text: string, id: string, modname = "A2b") => {
  const edit = languageChangeEdit(text, id, modname);
  return edit ? applyLineEdit(text, edit) : text;
};

describe("Choose Language", () => {
  it("replaces DrRacket's metadata lines and keeps the program", () => {
    const bsl = newFileText("beginner", "A2b") + body;
    const isl = change(bsl, "intermediate");
    expect(isl).toBe(newFileText("intermediate", "A2b") + body);
    expect(currentLanguageId(isl)).toBe("intermediate");
  });

  it("replaces a #lang line in place", () => {
    const text = ";; header comment\n#lang htdp/bsl\n" + body;
    const out = change(text, "beginner");
    expect(out).toBe(";; header comment\n" + newFileText("beginner", "A2b") + body);
  });

  it("switches a teaching file to #lang racket", () => {
    const out = change(newFileText("advanced", "A2b") + body, "racket");
    expect(out).toBe("#lang racket\n" + body);
  });

  it("adds a declaration to a file without one", () => {
    expect(change(body, "beginner-abbr")).toBe(newFileText("beginner-abbr", "A2b") + body);
  });

  it("does nothing when the language is already selected", () => {
    const bsl = newFileText("beginner", "A2b") + body;
    expect(languageChangeEdit(bsl, "beginner", "other")).toBeNull();
  });

  it("never changes anything after the declaration", () => {
    const tricky = newFileText("beginner", "x") + "#lang racket\n;; looks like a header\n";
    const out = change(tricky, "intermediate", "x");
    expect(out.endsWith("#lang racket\n;; looks like a header\n")).toBe(true);
  });
});
