// Exam Mode: the editor gives no help beyond the code itself. While it is on,
// the settings below are off whatever they are set to; the stored settings
// are left as they are and apply again when Exam Mode is turned off.
//
// Running the program is not affected: Run, the tests, the Stepper and the
// Interactions report exactly what they report outside Exam Mode, because
// their messages come from Racket.

import type { Preferences } from "./preferences";

/** The assistance Exam Mode turns off, with the value it forces. */
export const EXAM_MODE_OVERRIDES = {
  /** Suggestions while typing, and Ctrl+Space. */
  suggestions: false,
  /** Information and documentation links when hovering a name. */
  hovers: false,
  /** Errors marked while typing, unused names, Racket-aware rename. */
  liveCheck: false,
  /** The binding and uses of the name under the cursor. */
  highlightOccurrences: false,
  /** Error messages written after their line. */
  inlineErrors: false,
  /** Faded unused names. */
  fadeUnused: false,
} as const satisfies Partial<Preferences>;

export type ExamControlled = keyof typeof EXAM_MODE_OVERRIDES;

/** What Exam Mode turns off, for people (Settings, the confirmation). */
export const EXAM_MODE_SUMMARY = [
  "Suggestions while typing and Ctrl+Space",
  "Information and documentation when hovering a name",
  "Checking while typing (errors are still reported by Run)",
  "Highlighting of the name under the cursor",
];

const cache = new WeakMap<Preferences, Preferences>();

/** The preferences in effect: the stored ones, with Exam Mode's overrides
 * while it is on. The same object is returned for the same stored
 * preferences, so it can be selected from the store. */
export function effectivePrefs(prefs: Preferences): Preferences {
  if (!prefs.examMode) return prefs;
  let out = cache.get(prefs);
  if (!out) {
    out = { ...prefs, ...EXAM_MODE_OVERRIDES };
    cache.set(prefs, out);
  }
  return out;
}

/** True when Exam Mode decides this setting. */
export function examControls(prefs: Preferences, key: keyof Preferences): boolean {
  return prefs.examMode && key in EXAM_MODE_OVERRIDES;
}
