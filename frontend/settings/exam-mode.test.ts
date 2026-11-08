import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, mergePreferences } from "./preferences";
import { EXAM_MODE_OVERRIDES, effectivePrefs, examControls } from "./exam-mode";

describe("Exam Mode", () => {
  it("is off by default and kept across restarts", () => {
    expect(DEFAULT_PREFERENCES.examMode).toBe(false);
    expect(mergePreferences({ examMode: true }).examMode).toBe(true);
    expect(mergePreferences({ examMode: "yes" }).examMode).toBe(false);
  });

  it("changes nothing while it is off", () => {
    const prefs = { ...DEFAULT_PREFERENCES };
    expect(effectivePrefs(prefs)).toBe(prefs);
    expect(examControls(prefs, "suggestions")).toBe(false);
  });

  it("turns the assistance off while it is on, keeping the stored settings", () => {
    const prefs = { ...DEFAULT_PREFERENCES, examMode: true, suggestions: true, hovers: true, liveCheck: true };
    const effective = effectivePrefs(prefs);
    for (const [key, value] of Object.entries(EXAM_MODE_OVERRIDES)) expect(effective[key as keyof typeof effective]).toBe(value);
    expect(effective.suggestions).toBe(false);
    expect(effective.hovers).toBe(false);
    expect(effective.liveCheck).toBe(false);
    expect(effective.highlightOccurrences).toBe(false);
    // The stored preferences are not changed.
    expect(prefs.suggestions).toBe(true);
    // Settings that are not assistance are untouched.
    expect(effective.fontSize).toBe(prefs.fontSize);
    expect(effective.autoClosingBrackets).toBe(prefs.autoClosingBrackets);
  });

  it("returns the same object for the same preferences (safe to select from the store)", () => {
    const prefs = { ...DEFAULT_PREFERENCES, examMode: true };
    expect(effectivePrefs(prefs)).toBe(effectivePrefs(prefs));
  });

  it("marks the settings it decides", () => {
    const prefs = { ...DEFAULT_PREFERENCES, examMode: true };
    expect(examControls(prefs, "suggestions")).toBe(true);
    expect(examControls(prefs, "liveCheck")).toBe(true);
    expect(examControls(prefs, "fontSize")).toBe(false);
  });
});
