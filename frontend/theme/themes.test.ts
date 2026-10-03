// Every built-in theme must be readable for hours of work: text and syntax
// colors meet WCAG AA (4.5:1) on the surfaces where they appear.

import { describe, expect, it } from "vitest";
import { THEMES, type Theme } from "./themes";
import { contrast } from "./contrast";

const AA = 4.5;
/** Large or non-text UI elements (borders of focus, accent fills). */
const UI = 3;

function checks(t: Theme): [string, string, string, number][] {
  const c = t.colors;
  const out: [string, string, string, number][] = [];
  const surfaces = ["app.background", "sidebar.background", "panel.background", "menu.background", "surface.raised"] as const;
  for (const s of surfaces) {
    out.push(["text.primary", c["text.primary"], s, AA]);
    out.push(["text.secondary", c["text.secondary"], s, AA]);
    out.push(["error", c.error, s, AA]);
    out.push(["test.pass", c["test.pass"], s, AA]);
    out.push(["test.fail", c["test.fail"], s, AA]);
    out.push(["interaction.result", c["interaction.result"], s, AA]);
    out.push(["interaction.stderr", c["interaction.stderr"], s, AA]);
    out.push(["accent.primary (links)", c["accent.primary"], s, AA]);
  }
  out.push(["statusBar.foreground", c["statusBar.foreground"], "statusBar.background", AA]);
  out.push(["accent.foreground", c["accent.foreground"], "accent.primary", AA]);
  out.push(["run.foreground", c["run.foreground"], "run.background", AA]);
  out.push(["warning", c.warning, "warning.background", AA]);
  out.push(["editor.foreground", c["editor.foreground"], "editor.background", AA]);
  out.push(["editor.lineNumber", c["editor.lineNumber"], "editor.background", UI]);
  out.push(["focus.border", c["focus.border"], "app.background", UI]);
  out.push(["text.primary on selection", c["text.primary"], "selection.background", AA]);
  for (const [k, v] of Object.entries(t.syntax)) {
    out.push([`syntax.${k}`, v, "editor.background", AA]);
    out.push([`syntax.${k} on line highlight`, v, "editor.lineHighlight", AA]);
  }
  return out;
}

describe.each(THEMES.map((t) => [t.name, t] as const))("%s", (_name, theme) => {
  it("meets contrast requirements", () => {
    const failures = checks(theme)
      .map(([what, fg, bgKey, min]) => {
        const bg = theme.colors[bgKey as keyof Theme["colors"]];
        const ratio = contrast(fg, bg);
        return ratio < min ? `${what} on ${bgKey}: ${ratio.toFixed(2)} < ${min}` : null;
      })
      .filter(Boolean);
    expect(failures).toEqual([]);
  });

  it("defines every token as a parseable color", () => {
    for (const v of [...Object.values(theme.colors), ...Object.values(theme.syntax)]) {
      expect(v).toMatch(/^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/);
    }
  });
});

describe("theme catalog", () => {
  it("has unique ids and the required themes", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["phd-light", "phd-dark", "midnight", "hc-dark", "hc-light", "waterloo-math-pink", "waterloo-black-gold"]) {
      expect(ids).toContain(id);
    }
  });

  it("marks the Waterloo-inspired themes as unofficial", () => {
    for (const t of THEMES.filter((t) => t.id.startsWith("waterloo"))) {
      expect(t.unofficial).toBe(true);
      expect(t.description).toMatch(/unofficial/i);
    }
  });

  it("all themes share the same token set", () => {
    const keys = Object.keys(THEMES[0].colors).sort();
    for (const t of THEMES) expect(Object.keys(t.colors).sort()).toEqual(keys);
  });
});
