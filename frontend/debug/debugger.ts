// The debugger's UI side: breakpoints (in the editor's margin, F9), Debug
// (F6), and while paused Continue (F5), Step Over (F10), Step Into (F11) and
// Step Out (Shift+F11); Pause (F6) while running. The program runs as an ordinary Run in the bridge,
// annotated by DrRacket's debugger (backend/racket/private/debugger.rkt).
//
// Breakpoints are model decorations, so they move with the code as it is
// edited; their lines are read when debugging starts or changes.

import { useSyncExternalStore } from "react";
import type { BridgeEvent, EngineEvent } from "@shared/protocol";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID } from "@frontend/editor/racket-language";
import { backend } from "@frontend/ipc/backend";
import { activateTab, activeDoc, addEngineListener, getState, notify, runActive, setPanel, type Doc } from "@frontend/app/store";

type Paused = Extract<BridgeEvent, { ev: "paused" }>;

export interface DebugState {
  /** off: no debug session; running; paused; idle: the program finished but
   * its breakpoints still apply to Interactions. */
  status: "off" | "running" | "paused" | "idle";
  docId: string | null;
  paused: Paused | null;
  /** The call stack frame whose variables are shown. */
  frame: number;
  /** Breakpoint lines that have code to stop at (null: not known yet). */
  verified: number[] | null;
}

let state: DebugState = { status: "off", docId: null, paused: null, frame: 0, verified: null };
const listeners = new Set<() => void>();

function set(patch: Partial<DebugState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
  refreshDecorations();
}

export function debugState(): DebugState {
  return state;
}

export function useDebug<T>(select: (s: DebugState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

// ---------------------------------------------------------------------------
// Breakpoints

const breakpoints = new Map<monaco.editor.ITextModel, string[]>();

/** Breakpoint lines of a model, in order. */
export function breakpointLines(model: monaco.editor.ITextModel): number[] {
  const ids = breakpoints.get(model) ?? [];
  const lines = ids.map((id) => model.getDecorationRange(id)?.startLineNumber).filter((l): l is number => !!l);
  return [...new Set(lines)].sort((a, b) => a - b);
}

function setBreakpointLines(model: monaco.editor.ITextModel, lines: number[]) {
  const old = breakpoints.get(model) ?? [];
  const ids = model.deltaDecorations(
    old,
    lines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: { glyphMarginClassName: "phd-breakpoint", stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
    })),
  );
  breakpoints.set(model, ids);
  refreshDecorations();
  // A running debug session of this file learns the new lines at once.
  const doc = debugDoc();
  if (doc && doc.model === model && state.status !== "off") void backend.debugControl("breakpoints", lines).catch(() => {});
  for (const l of listeners) l();
}

export function toggleBreakpoint(model: monaco.editor.ITextModel, line: number) {
  const lines = breakpointLines(model);
  setBreakpointLines(model, lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]);
}

export function removeAllBreakpoints() {
  for (const m of [...breakpoints.keys()]) if (!m.isDisposed()) setBreakpointLines(m, []);
}

/** Every breakpoint, for the Debug panel. */
export function allBreakpoints(): { doc: Doc; line: number }[] {
  return getState().docs.flatMap((doc) => breakpointLines(doc.model).map((line) => ({ doc, line })));
}

// ---------------------------------------------------------------------------
// Decorations: verified/unverified breakpoints and the paused expression

const pausedDecorations = new Map<monaco.editor.ITextModel, string[]>();

function debugDoc(): Doc | null {
  return getState().docs.find((d) => d.id === state.docId) ?? null;
}

function refreshDecorations() {
  const doc = debugDoc();
  // Breakpoints of the debugged file show whether they have code to stop at.
  for (const [model, ids] of breakpoints) {
    if (model.isDisposed()) continue;
    const verified = doc && doc.model === model && state.status !== "off" ? state.verified : null;
    for (const id of ids) {
      const r = model.getDecorationRange(id);
      if (!r) continue;
      const unverified = verified !== null && !verified.includes(r.startLineNumber);
      model.deltaDecorations([id], []);
      const [nid] = model.deltaDecorations(
        [],
        [
          {
            range: r,
            options: {
              glyphMarginClassName: `phd-breakpoint${unverified ? " unverified" : ""}`,
              glyphMarginHoverMessage: { value: unverified ? "Breakpoint (no code to stop at on this line)" : "Breakpoint" },
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            },
          },
        ],
      );
      ids[ids.indexOf(id)] = nid;
    }
  }
  for (const [model, ids] of pausedDecorations) if (!model.isDisposed()) model.deltaDecorations(ids, []);
  pausedDecorations.clear();
  const p = state.paused;
  if (!doc || !p || state.status !== "paused") return;
  const model = doc.model;
  const text = model.getValue();
  const frame = p.frames[state.frame];
  const at = state.frame === 0 || !frame || frame.position === null ? { position: p.position, span: p.span } : { position: frame.position, span: frame.span };
  const start = model.getPositionAt(cpToUtf16(text, at.position));
  const end = model.getPositionAt(cpToUtf16(text, at.position + Math.max(at.span, 1)));
  const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  const after = p.kind === "after" && p.value !== null && state.frame === 0 && getState().prefs.debugInlineValues;
  pausedDecorations.set(
    model,
    model.deltaDecorations(
      [],
      [
        { range: new monaco.Range(start.lineNumber, 1, start.lineNumber, 1), options: { isWholeLine: true, className: "phd-paused-line", glyphMarginClassName: "phd-paused-arrow" } },
        {
          range,
          options: {
            className: "phd-paused-expr",
            after: after ? { content: `  ⇒ ${p.value!.split("\n")[0]}`, inlineClassName: "phd-paused-value" } : undefined,
          },
        },
      ],
    ),
  );
}

function cpToUtf16(text: string, cp: number): number {
  if (!/[\uD800-\uDFFF]/.test(text)) return cp;
  let u = 0;
  let i = 0;
  for (const ch of text) {
    if (i++ >= cp) break;
    u += ch.length;
  }
  return u;
}

// ---------------------------------------------------------------------------
// Session

/** The Run session that was current when debugging started: its events
 * (e.g. its end, as the new Run replaces it) are not this session's. */
let replacedSession: number | null = null;

export async function startDebugging() {
  const doc = activeDoc();
  if (!doc) return;
  replacedSession = getState().run.session;
  set({ status: "running", docId: doc.id, paused: null, frame: 0, verified: null });
  await runActive(breakpointLines(doc.model));
  if (getState().run.docId !== doc.id) set({ status: "off" });
}

function control(action: "continue" | "step-over" | "step-into" | "step-out" | "pause") {
  if (state.status === "off") return;
  void backend.debugControl(action).catch((e) => notify("error", String(e)));
}

export const debugContinue = () => state.status === "paused" && control("continue");
export const debugPause = () => state.status === "running" && control("pause");
export const debugStepOver = () => state.status === "paused" && control("step-over");
export const debugStepInto = () => state.status === "paused" && control("step-into");
export const debugStepOut = () => state.status === "paused" && control("step-out");

export function selectFrame(index: number) {
  set({ frame: index });
  revealPaused();
}

function revealPaused() {
  const doc = debugDoc();
  if (!doc || !state.paused) return;
  const group = Object.values(getState().layout.groups).find((g) => g.tabs.includes(doc.id));
  if (group && group.active !== doc.id) activateTab(group.id, doc.id);
  const p = state.paused;
  const frame = p.frames[state.frame];
  const line = state.frame === 0 || !frame?.line ? p.line : frame.line;
  for (const editor of monaco.editor.getEditors()) {
    if (editor.getModel() === doc.model) editor.revealLineInCenterIfOutsideViewport(line);
  }
}

function onEvent(e: EngineEvent): boolean {
  if (state.status === "off" || e.session !== getState().run.session || e.session === replacedSession) return false;
  if (e.type === "session-ended") {
    set({ status: "off", paused: null, verified: null });
    return false;
  }
  const ev = e.event;
  if (ev.ev === "paused") {
    // Frames from code the language generated (e.g. around check-expect) are
    // not in the file; the stack shows only the program's own expressions.
    const length = [...(debugDoc()?.model.getValue() ?? "")].length;
    const own = ev.frames.filter((f, i) => i === 0 || (f.position !== null && f.position + f.span <= length && f.line !== null));
    set({ status: "paused", paused: { ...ev, frames: own }, frame: 0 });
    revealPaused();
    setPanel("debug");
  } else if (ev.ev === "resumed") {
    set({ status: "running", paused: null, frame: 0 });
  } else if (ev.ev === "breakpoints") {
    set({ verified: ev.lines });
  } else if (ev.ev === "done" && String(ev.id) === String(getState().run.runRequest) && state.status === "running") {
    set({ status: "idle" });
  }
  return false;
}

// ---------------------------------------------------------------------------

let installed = false;

export function installDebugger() {
  if (installed) return;
  installed = true;
  addEngineListener(onEvent);

  // The margin left of the line numbers toggles breakpoints.
  monaco.editor.onDidCreateEditor((editor) => {
    editor.updateOptions({ glyphMargin: true });
    let hint: string[] = [];
    editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) return;
      const model = editor.getModel();
      if (model && model.getLanguageId() === RACKET_LANGUAGE_ID) toggleBreakpoint(model, e.target.position.lineNumber);
    });
    editor.onMouseMove((e) => {
      const model = editor.getModel();
      if (!model) return;
      const line = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ? e.target.position?.lineNumber : undefined;
      hint = model.deltaDecorations(
        hint,
        line && !breakpointLines(model).includes(line) ? [{ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: "phd-breakpoint-hint" } }] : [],
      );
    });
    editor.onMouseLeave(() => {
      const model = editor.getModel();
      if (model) hint = model.deltaDecorations(hint, []);
    });
  });

  // While paused, hovering a name shows its value in the selected frame.
  monaco.languages.registerHoverProvider(RACKET_LANGUAGE_ID, {
    provideHover(model, position) {
      const doc = debugDoc();
      if (state.status !== "paused" || !state.paused || !doc || doc.model !== model) return null;
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const frame = state.paused.frames[state.frame] ?? state.paused.frames[0];
      const b = frame?.bindings.find((x) => x.name === word.word);
      if (!b) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: "```racket\n" + `${b.name} = ${b.value}` + "\n```" }],
      };
    },
  });
}
