import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTerms, TERMS_MARKDOWN, TERMS_VERSION, termsToPlainText } from "./terms";

const installerCopy = fileURLToPath(new URL("../../apps/desktop/src-tauri/TERMS.txt", import.meta.url));

describe("Beta Terms of Use", () => {
  it("has a version taken from the Last Updated line", () => {
    expect(TERMS_VERSION).toBe("October 3, 2026");
  });

  it("has no unfilled placeholders", () => {
    expect(TERMS_MARKDOWN).not.toMatch(/\[[A-Z][A-Z /]+\]/);
  });

  it("parses into all 23 sections", () => {
    expect(parseTerms(TERMS_MARKDOWN).filter((b) => b.kind === "heading")).toHaveLength(23);
  });

  it("the installer's plain-text copy matches docs/TERMS.md", () => {
    // Regenerate with: pnpm terms
    const bytes = readFileSync(installerCopy);
    // No byte-order mark: Tauri adds one when it embeds the license file.
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toBe(termsToPlainText(TERMS_MARKDOWN));
  });
});
