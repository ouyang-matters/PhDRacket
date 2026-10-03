// Display-only language detection, kept in step with backend/src/language.rs.
// Used to update the status bar and decorations while the user edits. The
// Racket bridge alone decides how a program runs.

import type { LanguageSummary } from "@shared/protocol";
import { DRRACKET_PREFIX, NEW_FILE_LANGUAGES } from "./new-file";

const LANG_SHORT: Record<string, string> = {
  "htdp/bsl": "BSL",
  "htdp/bsl+": "BSL+",
  "htdp/isl": "ISL",
  "htdp/isl+": "ISL+λ",
  "htdp/asl": "ASL",
};

export function detectLanguage(text: string): LanguageSummary {
  const lines = text.split("\n", 4);
  if (lines[0] === DRRACKET_PREFIX[0] && lines[1] === DRRACKET_PREFIX[1] && lines[2]?.startsWith("#reader")) {
    const rest = lines[2].slice("#reader".length);
    for (const l of NEW_FILE_LANGUAGES) {
      if (!l.reader) continue;
      const spec = `(lib "${l.reader}" "lang")`;
      if (rest.startsWith(spec) && rest.slice(spec.length).trimStart().startsWith("(")) {
        return { kind: "teaching", id: l.id, name: l.name, short: l.short, langLine: null, metadataLines: 3 };
      }
    }
    return {
      kind: "unrecognized-metadata",
      id: null,
      name: "Unrecognized DrRacket language",
      short: "?",
      langLine: null,
      metadataLines: 3,
    };
  }
  const lang = findLangLine(text);
  if (lang) {
    return { kind: "module", id: null, name: `#lang ${lang.lang}`, short: LANG_SHORT[lang.lang] ?? lang.lang, langLine: lang.lang, metadataLines: 0 };
  }
  return { kind: "unspecified", id: null, name: "No language specified", short: "No language", langLine: null, metadataLines: 0 };
}

/** The `#lang` line and its 0-based line index, if it precedes all code
 * (only blank lines, `;` comments and a `#!/` line may come first). */
export function findLangLine(text: string): { lang: string; line: number } | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith(";") || t.startsWith("#!/")) continue;
    const m = /^#lang[ \t]+(\S.*)$/.exec(t);
    return m ? { lang: m[1].trim(), line: i } : null;
  }
  return null;
}
