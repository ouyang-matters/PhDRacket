import { describe, expect, it } from "vitest";
import { PROFILES, STEPPER_PROVIDERS, profileById, versionMismatch } from "./profiles";

describe("profiles", () => {
  it("offers the four modes", () => {
    expect(PROFILES.map((p) => p.short)).toEqual(["CS145", "CS135", "HtDP", "Racket"]);
  });

  it("falls back to the default profile", () => {
    expect(profileById("nope").id).toBe("waterloo-cs145");
  });

  it("reports version mismatches concisely, never for unknown expectations", () => {
    expect(versionMismatch(profileById("waterloo-cs145"), "9.4")).toBe("Expected Racket 9.3");
    expect(versionMismatch(profileById("waterloo-cs145"), "9.3")).toBeNull();
    expect(versionMismatch(profileById("waterloo-cs135"), "9.4")).toBeNull();
  });

  it("only references stepper providers that exist", () => {
    for (const p of PROFILES) if (p.stepperProvider) expect(STEPPER_PROVIDERS[p.stepperProvider]).toBeDefined();
  });
});
