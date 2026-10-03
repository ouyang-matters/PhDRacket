// The text edit for an explicit "Choose Language" request. Only the
// language declaration changes: DrRacket's three metadata lines or the
// `#lang` line. The rest of the file is never touched.

import { detectLanguage, findLangLine } from "./language";
import { NEW_FILE_LANGUAGES, teachingHeader } from "./new-file";

export interface LineRangeEdit {
  /** 1-based, inclusive line range to replace; `endLine` 0 means insert before `startLine`. */
  startLine: number;
  endLine: number;
  /** Replacement text without a trailing newline (for inserts, with one). */
  text: string;
}

/** The declaration DrRacket would write for `languageId`, without a final newline. */
export function declarationFor(languageId: string, modname: string): string {
  const lang = NEW_FILE_LANGUAGES.find((l) => l.id === languageId);
  if (!lang) throw new Error(`unknown language ${languageId}`);
  return lang.reader ? teachingHeader(lang, modname).replace(/\n$/, "") : `#lang ${lang.lang}`;
}

/** The id of the current language in NEW_FILE_LANGUAGES terms, if any. */
export function currentLanguageId(text: string): string | null {
  const l = detectLanguage(text);
  if (l.kind === "teaching") return l.id;
  if (l.kind === "module" && l.langLine === "racket") return "racket";
  return null;
}

export function languageChangeEdit(text: string, languageId: string, modname: string): LineRangeEdit | null {
  if (currentLanguageId(text) === languageId) return null;
  const decl = declarationFor(languageId, modname);
  const current = detectLanguage(text);
  if (current.metadataLines > 0) {
    return { startLine: 1, endLine: current.metadataLines, text: decl };
  }
  const langLine = findLangLine(text);
  if (langLine) {
    return { startLine: langLine.line + 1, endLine: langLine.line + 1, text: decl };
  }
  return { startLine: 1, endLine: 0, text: `${decl}\n` };
}

/** Applies an edit to plain text (used by tests and for previews). */
export function applyLineEdit(text: string, edit: LineRangeEdit): string {
  const lines = text.split("\n");
  if (edit.endLine === 0) {
    return [...lines.slice(0, edit.startLine - 1), edit.text.replace(/\n$/, ""), ...lines.slice(edit.startLine - 1)].join("\n");
  }
  return [...lines.slice(0, edit.startLine - 1), edit.text, ...lines.slice(edit.endLine)].join("\n");
}
