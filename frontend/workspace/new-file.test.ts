import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NEW_FILE_LANGUAGES, newFileText, renameGeneratedHeader } from "./new-file";

// Produced by Racket's printer; also checked by compatibility-tests/bridge-tests.rkt.
const fixture: Record<string, string> = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../compatibility-tests/fixtures/drracket-headers.json", import.meta.url)), "utf8"),
);

describe("new-file headers", () => {
  it.each(NEW_FILE_LANGUAGES.filter((l) => l.reader).map((l) => l.id))("%s matches DrRacket", (id) => {
    expect(newFileText(id, "untitled")).toBe(fixture[id]);
  });

  it("updates the modname only while the generated header is untouched", () => {
    const text = newFileText("beginner", "untitled") + "(+ 1 2)\n";
    const renamed = renameGeneratedHeader(text, "beginner", "untitled", "A3b")!;
    expect(renamed).toContain("((modname A3b)");
    expect(renamed.endsWith("(+ 1 2)\n")).toBe(true);
    expect(renameGeneratedHeader("edited" + text, "beginner", "untitled", "A3b")).toBeNull();
  });

  it("uses #lang for module languages", () => {
    expect(newFileText("racket", "x")).toBe("#lang racket\n\n");
  });
});
