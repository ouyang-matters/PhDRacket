import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, mergePreferences } from "./preferences";

describe("preferences", () => {
  it("default to the conservative choices", () => {
    expect(DEFAULT_PREFERENCES.autosave).toBe("off");
    // Suggestions and checking while typing are on; both can be turned off.
    expect(DEFAULT_PREFERENCES.suggestions).toBe(true);
    expect(DEFAULT_PREFERENCES.liveCheck).toBe(true);
    expect(DEFAULT_PREFERENCES.theme).toBe("system");
  });

  it("migrate settings from earlier versions", () => {
    expect(mergePreferences({ autosave: true }).autosave).toBe("afterDelay");
    expect(mergePreferences({ autosave: false }).autosave).toBe("off");
    expect(mergePreferences({ theme: "dark" }).theme).toBe("phd-dark");
    expect(mergePreferences({ theme: "high-contrast" }).theme).toBe("hc-dark");
  });

  it("reject invalid values", () => {
    expect(mergePreferences({ autosave: "sometimes" }).autosave).toBe("off");
    expect(mergePreferences({ autosaveDelay: 5 }).autosaveDelay).toBe(200);
    expect(mergePreferences({ startupAnimation: "loud" }).startupAnimation).toBe("full");
    expect(mergePreferences({ keybindings: { "run.run": "F9", bad: 3 } }).keybindings).toEqual({ "run.run": "F9" });
  });
});
