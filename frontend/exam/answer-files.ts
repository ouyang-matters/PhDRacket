// Exam Mode answer files: what a new one can be, and its name. Pure; the
// store creates and opens the files (frontend/app/store.ts) and the backend
// writes them (backend/src/exam.rs).

import { NEW_FILE_LANGUAGES, newFileText } from "@frontend/workspace/new-file";

export interface AnswerKind {
  id: string;
  /** "Text File": shown as "New Text File". */
  label: string;
  /** Extension without the dot; "" for none. */
  ext: string;
  /** The new file's text, for its name without extension. */
  text(stem: string): string;
}

export const ANSWER_KINDS: AnswerKind[] = [
  { id: "text", label: "Text File", ext: "txt", text: () => "" },
  { id: "markdown", label: "Markdown File", ext: "md", text: () => "" },
  ...NEW_FILE_LANGUAGES.map(
    (l): AnswerKind => ({ id: `racket:${l.id}`, label: `Racket File (${l.name})`, ext: "rkt", text: (stem) => newFileText(l.id, stem) }),
  ),
];

const pad = (n: number) => String(n).padStart(2, "0");

/** "answer-2026-11-08-1432": sorts by time, valid on every platform and as a
 * Racket module name. */
export function answerStem(now: Date): string {
  return `answer-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** A file name typed by the user, split for a new answer file; null when it
 * is not a usable name. Any extension, or none, is allowed. */
export function parseAnswerName(typed: string): { stem: string; ext: string } | null {
  const name = typed.trim();
  if (!name || name.length > 200 || name.startsWith(".") || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) return null;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot + 1) } : { stem: name, ext: "" };
}

/** The text a new file named by the user starts with: a Racket file gets the
 * language of the current course (Beginning Student unless chosen). */
export function textForTyped(stem: string, ext: string, languageId = "beginner"): string {
  return ext.toLowerCase() === "rkt" ? newFileText(languageId, stem) : "";
}

/** Files edited as Racket; anything else is plain text (no Racket colors,
 * nothing checked while typing). */
export function isRacketFileName(name: string): boolean {
  return /\.(rkt|rktl|rktd|scrbl|ss|scm)$/i.test(name) || !/\.[^.]+$/.test(name);
}
