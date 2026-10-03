import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareVersions, parseAnnouncements, pendingAnnouncements } from "./announcements";

describe("compareVersions", () => {
  it.each([
    ["0.1.0", "0.1.0", 0],
    ["0.1.0-beta.2", "0.1.0-beta.1", 1],
    ["0.1.0-beta.10", "0.1.0-beta.9", 1],
    ["0.1.0", "0.1.0-beta.9", 1],
    ["0.2.0-beta.1", "0.1.0", 1],
    ["v1.0.0", "0.9.9", 1],
  ])("%s vs %s", (a, b, r) => expect(compareVersions(a, b)).toBe(r));
});

describe("announcements", () => {
  const json = JSON.stringify({
    announcements: [
      { id: "a", title: "Hello", body: "Text" },
      { id: "b", title: "Old", body: "x", until: "2020-01-01" },
      { id: "c", title: "CS135 only", body: "x", profiles: ["waterloo-cs135"] },
      { id: "d", title: "Fixed in beta.2", body: "x", maxVersion: "0.1.0-beta.1" },
      { id: "e", title: "Bad link", body: "x", link: { label: "click", url: "javascript:alert(1)" } },
      { id: "f", title: "Link", body: "x", link: { label: "Release", url: "https://github.com/x" } },
      { title: "missing id", body: "x" },
      "not an object",
    ],
  });
  const ctx = { version: "0.1.0-beta.2", profile: "waterloo-cs145", today: "2026-10-03", seen: ["a"] };

  it("validates untrusted input and keeps only https links", () => {
    const list = parseAnnouncements(json);
    expect(list.map((a) => a.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(list.find((a) => a.id === "e")?.link).toBeUndefined();
    expect(list.find((a) => a.id === "f")?.link?.url).toBe("https://github.com/x");
    expect(parseAnnouncements("not json")).toEqual([]);
  });

  it("filters by seen ids, date, profile and version", () => {
    expect(pendingAnnouncements(parseAnnouncements(json), ctx).map((a) => a.id)).toEqual(["e", "f"]);
  });

  it("accepts the published file", () => {
    const published = readFileSync(
      fileURLToPath(new URL("../../announcements/current.json", import.meta.url)),
      "utf8",
    );
    expect(() => JSON.parse(published)).not.toThrow();
    expect(Array.isArray(JSON.parse(published).announcements)).toBe(true);
  });
});
