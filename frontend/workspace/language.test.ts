import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLanguage } from "./language";

const root = fileURLToPath(new URL("../../compatibility-tests/", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".rkt") ? [p] : [];
  });
}

describe("detectLanguage agrees with the Racket bridge", () => {
  // The first line of each expected transcript is the language the bridge used.
  for (const file of walk(join(root, "corpus"))) {
    const rel = relative(join(root, "corpus"), file).replace(/\\/g, "/");
    it(rel, () => {
      const text = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
      const bridge = readFileSync(join(root, "expected", `${rel}.transcript`), "utf8").split("\n")[0];
      const l = detectLanguage(text);
      const ours =
        l.kind === "teaching"
          ? `language: teaching ${l.name}`
          : l.kind === "module"
            ? `language: module ${l.langLine}`
            : l.kind === "unspecified"
              ? "language: module null"
              : "language: unrecognized-metadata";
      expect(ours).toBe(bridge);
    });
  }
});
