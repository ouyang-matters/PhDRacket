import { describe, expect, it } from "vitest";
import { baseName, extensionOf, formatSize, isWithin, parentOf, rebase, relativeTo, samePath } from "./paths";
import { DEFAULT_HIDDEN, HIDDEN_PRESETS, customPatterns, hiddenMatcher, parsePatterns, presetEnabled, setPreset } from "./hidden";

describe("paths", () => {
  it("compares Windows paths ignoring separators and case", () => {
    expect(samePath("C:\\Course\\A3\\a3.rkt", "c:/course/a3/A3.rkt")).toBe(true);
    expect(samePath("/home/u/A.rkt", "/home/u/a.rkt")).toBe(false);
    expect(isWithin("C:\\Course\\A3\\a3.rkt", "C:\\Course")).toBe(true);
    expect(isWithin("C:\\Course2\\a.rkt", "C:\\Course")).toBe(false);
  });

  it("rebases paths under a renamed folder", () => {
    expect(rebase("C:\\c\\A3\\q1\\a.rkt", "C:\\c\\A3", "C:\\c\\Assignment 3")).toBe("C:\\c\\Assignment 3\\q1\\a.rkt");
    expect(rebase("/c/a.rkt", "/c/a.rkt", "/c/b.rkt")).toBe("/c/b.rkt");
  });

  it("splits names and formats sizes", () => {
    expect(baseName("C:\\c\\a3.rkt")).toBe("a3.rkt");
    expect(parentOf("C:\\c\\a3.rkt")).toBe("C:\\c");
    expect(relativeTo("C:\\c\\q\\a.rkt", "C:\\c")).toBe("q/a.rkt");
    expect(extensionOf("A3.RKT")).toBe("rkt");
    expect(extensionOf(".gitignore")).toBe("");
    expect([formatSize(12), formatSize(1536), formatSize(5 * 1024 * 1024)]).toEqual(["12 B", "1.5 KB", "5.0 MB"]);
  });
});

describe("hidden files", () => {
  it("matches names, folders only, and anchored paths", () => {
    const hide = hiddenMatcher(["*.zo", "compiled/", "docs/*.pdf", "notes?.txt"]);
    expect(hide("a3/compiled/a3_rkt.zo", false)).toBe(true);
    expect(hide("compiled", true)).toBe(true);
    expect(hide("compiled", false)).toBe(false);
    expect(hide("docs/spec.pdf", false)).toBe(true);
    expect(hide("other/docs/spec.pdf", false)).toBe(false);
    expect(hide("notes1.txt", false)).toBe(true);
    expect(hide("a3.rkt", false)).toBe(false);
    expect(hide("A3.ZO", false)).toBe(true);
  });

  it("hides what the Explorer hid before by default", () => {
    const hide = hiddenMatcher(DEFAULT_HIDDEN);
    expect(hide(".git", true)).toBe(true);
    expect(hide("compiled", true)).toBe(true);
    expect(hide("Thumbs.db", false)).toBe(true);
    expect(hide("a3.rkt", false)).toBe(false);
    expect(hide("a3.rkt~", false)).toBe(false);
  });

  it("turns presets on and off and keeps custom patterns apart", () => {
    const backups = HIDDEN_PRESETS.find((p) => p.id === "backups")!;
    const on = setPreset(["*.log"], backups, true);
    expect(presetEnabled(on, backups)).toBe(true);
    expect(customPatterns(on)).toEqual(["*.log"]);
    expect(setPreset(on, backups, false)).toEqual(["*.log"]);
    expect(parsePatterns(" *.log\n\ndrafts/ , *.log, !keep.rkt, a\\b/ ")).toEqual(["*.log", "drafts/", "a/b/"]);
  });
});
