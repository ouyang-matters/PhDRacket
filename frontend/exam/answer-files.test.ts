import { describe, expect, it } from "vitest";
import { ANSWER_KINDS, answerStem, isRacketFileName, parseAnswerName, textForTyped } from "./answer-files";

describe("answer files", () => {
  it("are named by the time they were started", () => {
    expect(answerStem(new Date(2026, 10, 8, 9, 5))).toBe("answer-2026-11-08-0905");
  });

  it("can be text, Markdown or Racket in any teaching language", () => {
    expect(ANSWER_KINDS.map((k) => k.ext)).toEqual(expect.arrayContaining(["txt", "md", "rkt"]));
    const bsl = ANSWER_KINDS.find((k) => k.id === "racket:beginner")!;
    expect(bsl.text("answer-1")).toContain("htdp-beginner-reader.ss");
    expect(bsl.text("answer-1")).toContain("(modname answer-1)");
    expect(ANSWER_KINDS.find((k) => k.id === "text")!.text("x")).toBe("");
  });

  it("accept any typed name with any extension, or none", () => {
    expect(parseAnswerName("q1.py")).toEqual({ stem: "q1", ext: "py" });
    expect(parseAnswerName(" notes ")).toEqual({ stem: "notes", ext: "" });
    expect(parseAnswerName("part.a.java")).toEqual({ stem: "part.a", ext: "java" });
  });

  it("refuse names that are not one plain file name", () => {
    for (const bad of ["", "  ", "../x.txt", "a/b.txt", "a\\b", "c:x", ".hidden", "ends.", "q?.txt"]) expect(parseAnswerName(bad)).toBeNull();
  });

  it("start a typed .rkt file in a language, other files empty", () => {
    expect(textForTyped("q2", "rkt")).toContain("htdp-beginner-reader.ss");
    expect(textForTyped("q2", "RKT", "racket")).toBe("#lang racket\n\n");
    expect(textForTyped("q2", "py")).toBe("");
  });

  it("edit Racket files as Racket and other files as plain text", () => {
    expect(isRacketFileName("a.rkt")).toBe(true);
    expect(isRacketFileName("untitled-1.rkt")).toBe(true);
    expect(isRacketFileName("Makefile")).toBe(true);
    expect(isRacketFileName("answer.txt")).toBe(false);
    expect(isRacketFileName("q1.py")).toBe(false);
    expect(isRacketFileName("notes.md")).toBe(false);
  });
});
