// Run / Interactions state, as a pure reducer over backend events.
//
// Presentation only: every value, error and test outcome shown here comes
// verbatim from the Racket bridge. The classification below only chooses a
// label and never changes or hides the message Racket produced.

import type { BridgeEvent, RunLanguage, Srcloc } from "@shared/protocol";

export type DiagnosticCategory = "syntax" | "racket" | "language" | "test" | "course" | "editor";

export interface Diagnostic {
  id: number;
  category: DiagnosticCategory;
  /** Category label shown to the user, e.g. "Syntax Error". */
  label: string;
  severity: "error" | "warning" | "info";
  /** The message as DrRacket would display it (htdp-rewritten if applicable). */
  message: string;
  /** exn-message exactly as Racket raised it. */
  originalMessage?: string;
  srcloc?: Srcloc;
  /** "definitions" or "interactions". */
  origin: "definitions" | "interactions";
}

export type EntryKind = "input" | "value" | "stdout" | "stderr" | "error" | "tests" | "info";

export interface Entry {
  id: number;
  kind: EntryKind;
  text: string;
  diagnostic?: Diagnostic;
}

export interface TestsResult {
  total: number;
  failed: number;
  signatureViolations: number;
  failures: (Srcloc | null)[];
  report: string;
  origin: "definitions" | "interactions";
}

export type RunStatus = "idle" | "running" | "ready" | "ended";

export interface RunState {
  session: number | null;
  status: RunStatus;
  /** Request id of the Run itself. */
  runRequest: number | null;
  /** Requests sent but not yet answered with `done`. */
  pending: number[];
  /** Requests answered before the UI learned their id (the reply can
   * arrive before the eval call returns). */
  answered: number[];
  docId: string | null;
  path: string | null;
  /** Editor alternative-version id of the Definitions when Run was pressed. */
  runVersion: number | null;
  language: RunLanguage | null;
  racketVersion: string | null;
  transcript: Entry[];
  tests: TestsResult | null;
  diagnostics: Diagnostic[];
  endedReason: string | null;
  definitionsOk: boolean | null;
  nextId: number;
}

export const initialRunState: RunState = {
  session: null,
  status: "idle",
  runRequest: null,
  pending: [],
  answered: [],
  docId: null,
  path: null,
  runVersion: null,
  language: null,
  racketVersion: null,
  transcript: [],
  tests: null,
  diagnostics: [],
  endedReason: null,
  definitionsOk: null,
  nextId: 1,
};

/** Category and label for a Racket error, decided only by the exception
 * kind the bridge reported. */
export function classifyError(kind: string, language: RunLanguage | null): Pick<Diagnostic, "category" | "label" | "severity"> {
  const lang = language?.kind === "teaching" && language.name ? ` · ${language.name}` : "";
  switch (kind) {
    case "read":
      return { category: "syntax", label: `Syntax Error (reader)${lang}`, severity: "error" };
    case "syntax":
      return { category: "syntax", label: `Syntax Error${lang}`, severity: "error" };
    case "language":
      return { category: "language", label: "Language Configuration Error", severity: "error" };
    case "bridge":
      return { category: "editor", label: "PhDRacket", severity: "error" };
    case "break":
      return { category: "racket", label: "Stopped", severity: "info" };
    default:
      return { category: "racket", label: `Racket Error${lang}`, severity: "error" };
  }
}

export function startRun(
  prev: RunState,
  args: { session: number; request: number; docId: string | null; path: string | null; runVersion: number | null },
): RunState {
  return {
    ...initialRunState,
    nextId: prev.nextId,
    racketVersion: prev.racketVersion,
    session: args.session,
    runRequest: args.request,
    pending: [args.request],
    status: "running",
    docId: args.docId,
    path: args.path,
    runVersion: args.runVersion,
  };
}

/** Records an Interactions entry. Call before sending it, so the input is
 * shown before anything the evaluation prints. */
export function addInput(prev: RunState, text: string): RunState {
  return {
    ...prev,
    status: "running",
    transcript: [...prev.transcript, { id: prev.nextId, kind: "input", text }],
    nextId: prev.nextId + 1,
  };
}

/** Records the request id of a sent entry once it is known. */
export function trackRequest(prev: RunState, request: number): RunState {
  if (prev.answered.includes(request)) {
    const answered = prev.answered.filter((a) => a !== request);
    return { ...prev, answered, status: prev.pending.length === 0 ? "ready" : "running" };
  }
  return { ...prev, status: "running", pending: [...prev.pending, request] };
}

/** The entry could not be sent. */
export function inputFailed(prev: RunState): RunState {
  return { ...prev, status: prev.pending.length === 0 ? "ready" : "running" };
}

function originOf(s: RunState, id: number | null): "definitions" | "interactions" {
  return id !== null && id === s.runRequest ? "definitions" : "interactions";
}

function append(s: RunState, entry: Omit<Entry, "id">): RunState {
  const last = s.transcript[s.transcript.length - 1];
  // Merge consecutive output chunks; chunk boundaries carry no meaning.
  if (last && (entry.kind === "stdout" || entry.kind === "stderr") && last.kind === entry.kind) {
    const merged = { ...last, text: last.text + entry.text };
    return { ...s, transcript: [...s.transcript.slice(0, -1), merged] };
  }
  return { ...s, transcript: [...s.transcript, { ...entry, id: s.nextId }], nextId: s.nextId + 1 };
}

export function applyBridgeEvent(s: RunState, ev: BridgeEvent): RunState {
  switch (ev.ev) {
    case "ready":
      return { ...s, racketVersion: ev.racketVersion };
    case "run-started":
      return { ...s, language: ev.language };
    case "value":
      return append(s, { kind: "value", text: ev.text });
    case "stdout":
      return append(s, { kind: "stdout", text: ev.text });
    case "stderr":
      return append(s, { kind: "stderr", text: ev.text });
    case "error": {
      const origin = originOf(s, ev.id);
      const diagnostic: Diagnostic = {
        id: s.nextId,
        ...classifyError(ev.kind, s.language),
        message: ev.message,
        originalMessage: ev.originalMessage,
        srcloc: ev.srclocs[0],
        origin,
      };
      const withEntry = append(s, { kind: "error", text: ev.message, diagnostic });
      return { ...withEntry, diagnostics: [...s.diagnostics, diagnostic] };
    }
    case "tests": {
      const origin = originOf(s, ev.id);
      const tests: TestsResult = {
        total: ev.total,
        failed: ev.failed,
        signatureViolations: ev.signatureViolations,
        failures: ev.failures,
        report: ev.report,
        origin,
      };
      const testDiagnostics: Diagnostic[] = ev.failures.map((loc, i) => ({
        id: s.nextId + i,
        category: "test",
        label: "Test Failure",
        severity: "warning",
        message: "Check failed.",
        srcloc: loc ?? undefined,
        origin,
      }));
      const base: RunState = {
        ...s,
        tests,
        nextId: s.nextId + testDiagnostics.length,
        diagnostics: [...s.diagnostics.filter((d) => d.category !== "test"), ...testDiagnostics],
      };
      return ev.report.trim() === "" ? base : append(base, { kind: "tests", text: ev.report });
    }
    case "done": {
      const id = typeof ev.id === "number" ? ev.id : null;
      const known = id !== null && s.pending.includes(id);
      const pending = s.pending.filter((p) => p !== id);
      return {
        ...s,
        pending,
        answered: !known && id !== null && id !== s.runRequest ? [...s.answered, id] : s.answered,
        status: pending.length === 0 ? "ready" : "running",
        definitionsOk: id !== null && id === s.runRequest ? ev.ok : s.definitionsOk,
      };
    }
    case "protocol-error":
      return append(s, { kind: "error", text: `PhDRacket bridge: ${ev.message}` });
    case "step":
    case "stepper-finished":
    case "check-result":
    case "breakpoints":
    case "paused":
    case "resumed":
      return s;
  }
}

export function endSession(s: RunState, reason: string, stderr: string): RunState {
  let next: RunState = { ...s, status: "ended", pending: [], endedReason: reason };
  if (stderr.trim()) next = append(next, { kind: "stderr", text: stderr });
  const shown: Record<string, string> = { stopped: "Stopped.", exited: "Program exited." };
  if (shown[reason]) next = append(next, { kind: "info", text: shown[reason] });
  return next;
}
