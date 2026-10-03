// Templates for files the user explicitly creates with a chosen language.
//
// For teaching languages this produces exactly the three metadata lines that
// DrRacket 9.3 writes (htdp-langs.rkt `get-metadata`, default settings). The
// output is checked against Racket's own printer by
// compatibility-tests/bridge-tests.rkt via compatibility-tests/fixtures/drracket-headers.json.
// PhDRacket never adds or rewrites these lines in an existing file.

export interface NewFileLanguage {
  id: string;
  name: string;
  short: string;
  /** Reader module for teaching languages. */
  reader?: string;
  /** DrRacket's `sharing-printing` default for the language. */
  sharing?: boolean;
  /** `#lang` line for module languages. */
  lang?: string;
}

export const NEW_FILE_LANGUAGES: NewFileLanguage[] = [
  { id: "beginner", name: "Beginning Student", short: "BSL", reader: "htdp-beginner-reader.ss", sharing: false },
  { id: "beginner-abbr", name: "Beginning Student with List Abbreviations", short: "BSL+", reader: "htdp-beginner-abbr-reader.ss", sharing: false },
  { id: "intermediate", name: "Intermediate Student", short: "ISL", reader: "htdp-intermediate-reader.ss", sharing: false },
  { id: "intermediate-lambda", name: "Intermediate Student with lambda", short: "ISL+λ", reader: "htdp-intermediate-lambda-reader.ss", sharing: false },
  { id: "advanced", name: "Advanced Student", short: "ASL", reader: "htdp-advanced-reader.ss", sharing: true },
  { id: "racket", name: "Racket (#lang racket)", short: "racket", lang: "racket" },
];

export const DRRACKET_PREFIX = [
  ";; The first three lines of this file were inserted by DrRacket. They record metadata",
  ";; about the language level of this file in a form that our tools can easily process.",
];

/** A Racket symbol printed with `~s`, for the simple names used as modnames. */
function printSymbol(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_\-+*/<>=!?.]*$/.test(name) && !/^[0-9.+-]/.test(name)
    ? name
    : `|${name.replace(/\|/g, "")}|`;
}

export function modnameFor(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, "") || "untitled";
}

export function teachingHeader(lang: NewFileLanguage, modname: string): string {
  if (!lang.reader) throw new Error(`${lang.id} is not a teaching language`);
  const sharing = lang.sharing ? "#t" : "#f";
  return (
    `${DRRACKET_PREFIX[0]}\n${DRRACKET_PREFIX[1]}\n` +
    `#reader(lib "${lang.reader}" "lang")((modname ${printSymbol(modname)}) (read-case-sensitive #t) ` +
    `(teachpacks ()) (htdp-settings #(#t constructor repeating-decimal ${sharing} #t none #f () #f)))\n`
  );
}

export function newFileText(languageId: string, modname: string): string {
  const lang = NEW_FILE_LANGUAGES.find((l) => l.id === languageId);
  if (!lang) throw new Error(`unknown language ${languageId}`);
  return lang.lang ? `#lang ${lang.lang}\n\n` : teachingHeader(lang, modname);
}

/** If `text` still begins with the header generated for `oldModname`,
 * returns it with the modname updated (DrRacket regenerates the header with
 * the file's name whenever it saves). Otherwise returns null. */
export function renameGeneratedHeader(text: string, languageId: string, oldModname: string, newModname: string): string | null {
  const lang = NEW_FILE_LANGUAGES.find((l) => l.id === languageId);
  if (!lang?.reader) return null;
  const old = teachingHeader(lang, oldModname);
  if (!text.startsWith(old)) return null;
  return teachingHeader(lang, newModname) + text.slice(old.length);
}
