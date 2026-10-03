// apps/desktop/index.html must contain no inline <style> or inline <script>.
// Tauri adds hashes of inline code to the Content-Security-Policy, and with
// hashes present browsers ignore 'unsafe-inline': the <style> elements Monaco
// creates at runtime would be blocked, leaving the editor without token
// colors, menus or decorations in release builds (0.1.1 shipped this bug).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../../apps/desktop/index.html", import.meta.url)), "utf8");

describe("index.html", () => {
  it("has no inline styles or scripts", () => {
    expect(html).not.toMatch(/<style[\s>]/i);
    for (const tag of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
      expect(tag, tag).toMatch(/<script\b[^>]*\bsrc=/i);
      expect(tag.replace(/<script\b[^>]*>|<\/script>/gi, "").trim()).toBe("");
    }
    expect(html).not.toMatch(/\sstyle="/i);
  });
});
