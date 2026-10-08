// Check while typing: each edited program is expanded in the background by
// Racket (backend/racket/private/analysis.rkt, DrRacket's Check Syntax) and
// the result drives the editor:
//
//   - errors as markers (and in the Problems panel), unused local names faded;
//   - the binding and uses of the name at the cursor highlighted (its scope);
//   - hovers ("imported from lang/htdp-beginner", "2 bound occurrences") with
//     documentation links, opened in a browser tab;
//   - Go to Definition, Find References and Rename that follow Racket's scopes;
//   - suggestions: the program's names and the language's.
//
// Nothing is run. Results for an older version of the text are discarded.

import { useSyncExternalStore } from "react";
import type { CheckDiagnostic, CheckResult, EngineEvent } from "@shared/protocol";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID, SPECIAL_FORMS, TEST_FORMS } from "@frontend/editor/racket-language";
import { backend } from "@frontend/ipc/backend";
import { addEngineListener, bumpRevision, getState, openWebTab, subscribe, type Doc } from "@frontend/app/store";
import { analyze, bindingAt, candidates, contains, narrowest, validIdentifier, type Analysis, type Range16 } from "./scope";

const OWNER = "phdracket.check";
const DELAY_MS = 450;

interface ModelState {
  /** The latest result's analysis, for the version it describes. */
  analysis: Analysis | null;
  /** The text the markers were made for. */
  text: string;
  inline: string[];
  diagnostics: CheckDiagnostic[];
  language: string | null;
  checking: boolean;
  /** When the check in progress was sent (Date.now()). */
  checkingSince: number;
  timer: number | null;
}

const states = new WeakMap<monaco.editor.ITextModel, ModelState>();
/** request id → the model and the version it was sent for */
const inflight = new Map<number, { model: monaco.editor.ITextModel; version: number; text: string }>();
/** Results that arrived before the request that asked for them was known:
 * the result event can overtake the reply to `backend.check`. */
const early = new Map<number, CheckResult>();
/** A check unanswered for this long is given up (Racket's own limit is 10 s),
 * so a lost result cannot stop checking for good. */
const GIVE_UP_MS = 30_000;
const exportsByLanguage = new Map<string, { name: string; kind: "value" | "syntax" }[]>();
let analysisSession: number | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version++;
  for (const l of listeners) l();
  bumpRevision();
}

function stateOf(model: monaco.editor.ITextModel): ModelState {
  let s = states.get(model);
  if (!s) {
    s = { analysis: null, diagnostics: [], language: null, checking: false, checkingSince: 0, timer: null, text: "", inline: [] };
    states.set(model, s);
  }
  return s;
}

function docOf(model: monaco.editor.ITextModel): Doc | undefined {
  return getState().docs.find((d) => d.model === model);
}

function enabled(): boolean {
  return getState().prefs.liveCheck && getState().runtime.state === "ready";
}

function schedule(model: monaco.editor.ITextModel, delay = DELAY_MS) {
  const s = stateOf(model);
  if (s.timer !== null) window.clearTimeout(s.timer);
  s.timer = window.setTimeout(() => {
    s.timer = null;
    void check(model);
  }, delay);
}

async function check(model: monaco.editor.ITextModel) {
  if (model.isDisposed() || !enabled()) return;
  const doc = docOf(model);
  if (!doc || doc.language.kind === "unspecified") return clear(model);
  const s = stateOf(model);
  // One check at a time per model; a newer edit checks again afterwards.
  if (s.checking && Date.now() - s.checkingSince < GIVE_UP_MS) return schedule(model);
  s.checking = true;
  s.checkingSince = Date.now();
  // The version of the text being sent, taken before any edit made while
  // waiting for the reply, so a result for older text is recognized as stale.
  const version = model.getAlternativeVersionId();
  const text = model.getValue();
  const wantExports = !s.language || !exportsByLanguage.has(s.language);
  try {
    const handle = await backend.check(doc.path, text, wantExports);
    analysisSession = handle.session;
    inflight.set(handle.request, { model, version, text });
    const result = early.get(handle.request);
    if (result) {
      early.delete(handle.request);
      onResult(handle.request, result);
    }
  } catch {
    s.checking = false;
  }
}

function clear(model: monaco.editor.ITextModel) {
  const s = stateOf(model);
  s.analysis = null;
  s.diagnostics = [];
  if (!model.isDisposed()) {
    monaco.editor.setModelMarkers(model, OWNER, []);
    s.inline = model.deltaDecorations(s.inline, []);
  }
  changed();
}

function onResult(id: number, result: CheckResult) {
  const req = inflight.get(id);
  if (!req) {
    early.set(id, result);
    // Only results whose request is still on its way belong here; keep few.
    if (early.size > 16) early.delete(early.keys().next().value!);
    return;
  }
  inflight.delete(id);
  const { model, text } = req;
  const s = stateOf(model);
  s.checking = false;
  if (model.isDisposed()) return;
  if (result.exports && result.language) exportsByLanguage.set(result.language, result.exports);
  const languageChanged = (result.language ?? null) !== s.language;
  s.language = result.language ?? null;
  // Stale: the text changed while checking; the pending timer checks again.
  if (model.getAlternativeVersionId() !== req.version) return;
  s.diagnostics = result.diagnostics;
  // An error means no bindings; keep the last good ones until it is fixed.
  if (result.diagnostics.every((d) => d.severity !== "error")) s.analysis = analyze(result, text);
  s.text = text;
  setMarkers(model, text, s);
  changed();
  if (languageChanged && s.language && !exportsByLanguage.has(s.language)) schedule(model, 0);
}

function rangeOf(model: monaco.editor.ITextModel, r: Range16): monaco.IRange {
  const a = model.getPositionAt(r[0]);
  const b = model.getPositionAt(Math.max(r[1], r[0]));
  return { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column };
}

function setMarkers(model: monaco.editor.ITextModel, text: string, s: ModelState) {
  const markers: monaco.editor.IMarkerData[] = [];
  for (const d of s.diagnostics) {
    const start = utf16(text, d.position);
    const end = d.span > 0 ? utf16(text, d.position + d.span) : model.getLineMaxColumn(d.line || 1);
    const range =
      d.span > 0 || d.position > 0
        ? rangeOf(model, [start, d.span > 0 ? end : start + 1])
        : { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: model.getLineMaxColumn(1) };
    markers.push({
      ...range,
      severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message.replace(/\n {2}in: [\s\S]*$/, ""),
      source: "Check",
    });
  }
  // Error messages after their line (Settings > Editor > Highlighting).
  const inline: monaco.editor.IModelDeltaDecoration[] = getState().prefs.inlineErrors
    ? markers.map((m) => ({
        // The line's text (an empty range at the end does not show injected text).
        range: new monaco.Range(
          m.endLineNumber,
          Math.max(1, model.getLineFirstNonWhitespaceColumn(m.endLineNumber)),
          m.endLineNumber,
          model.getLineMaxColumn(m.endLineNumber),
        ),
        options: { after: { content: `  ${m.message.split("\n")[0]}`, inlineClassName: m.severity === monaco.MarkerSeverity.Error ? "phd-inline-error" : "phd-inline-warning" } },
      }))
    : [];
  s.inline = model.deltaDecorations(s.inline, inline);
  for (const u of s.analysis && s.diagnostics.length === 0 && getState().prefs.fadeUnused ? s.analysis.unused : []) {
    markers.push({
      ...rangeOf(model, u),
      severity: monaco.MarkerSeverity.Hint,
      tags: [monaco.MarkerTag.Unnecessary],
      message: `${text.slice(u[0], u[1])} is never used`,
      source: "Check",
    });
  }
  monaco.editor.setModelMarkers(model, OWNER, markers);
}

function utf16(text: string, cp: number): number {
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
// Live problems for the UI (Problems panel, status bar)

export interface LiveProblems {
  checking: boolean;
  diagnostics: CheckDiagnostic[];
}

export function liveProblems(model: monaco.editor.ITextModel | null | undefined): LiveProblems {
  if (!model) return { checking: false, diagnostics: [] };
  const s = stateOf(model);
  return { checking: s.checking || s.timer !== null, diagnostics: s.diagnostics };
}

export function useAnalysisVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

// ---------------------------------------------------------------------------
// Editor features

function analysisFor(model: monaco.editor.ITextModel): Analysis | null {
  return states.get(model)?.analysis ?? null;
}

/** True when the model has a checked analysis (other providers then defer to it). */
export function hasAnalysis(model: monaco.editor.ITextModel): boolean {
  return !!analysisFor(model);
}

function registerProviders() {
  const lang = RACKET_LANGUAGE_ID;

  monaco.languages.registerDocumentHighlightProvider(lang, {
    provideDocumentHighlights(model, position) {
      const a = analysisFor(model);
      if (!a) return [];
      const b = bindingAt(a, model.getOffsetAt(position));
      if (!b) return [];
      return [
        { range: rangeOf(model, b.site), kind: monaco.languages.DocumentHighlightKind.Write },
        ...b.uses.map((u) => ({ range: rangeOf(model, u), kind: monaco.languages.DocumentHighlightKind.Read })),
      ];
    },
  });

  monaco.languages.registerHoverProvider(lang, {
    provideHover(model, position) {
      const a = analysisFor(model);
      if (!a) return null;
      const offset = model.getOffsetAt(position);
      const hovers = narrowest(a.hovers, offset);
      const docs = narrowest(a.docs, offset);
      if (hovers.length === 0 && docs.length === 0) return null;
      const range = (hovers[0] ?? docs[0]).range;
      const contents = [
        ...[...new Set(hovers.map((h) => h.text))].map((t) => ({ value: t })),
        ...docs.slice(0, 1).map((d) => ({ value: `[Documentation for \`${d.label}\`](${d.url})` })),
      ];
      return { range: rangeOf(model, range), contents };
    },
  });

  monaco.languages.registerDefinitionProvider(lang, {
    provideDefinition(model, position) {
      const a = analysisFor(model);
      if (!a) return null;
      const offset = model.getOffsetAt(position);
      const b = a.bindings.find((x) => x.uses.some((u) => contains(u, offset)));
      return b ? { uri: model.uri, range: rangeOf(model, b.site) } : null;
    },
  });

  monaco.languages.registerReferenceProvider(lang, {
    provideReferences(model, position) {
      const a = analysisFor(model);
      const b = a && bindingAt(a, model.getOffsetAt(position));
      if (!b) return [];
      return [b.site, ...b.uses].map((r) => ({ uri: model.uri, range: rangeOf(model, r) }));
    },
  });

  monaco.languages.registerRenameProvider(lang, {
    resolveRenameLocation(model, position) {
      const a = analysisFor(model);
      const b = a && bindingAt(a, model.getOffsetAt(position));
      if (!b) {
        return {
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: "",
          rejectReason: a ? "Only names defined in this file can be renamed." : "Rename needs the program to be checked first (it has an error, or Check while typing is off).",
        };
      }
      const offset = model.getOffsetAt(position);
      const at = [b.site, ...b.uses].find((r) => contains(r, offset)) ?? b.site;
      return { range: rangeOf(model, at), text: model.getValue().slice(at[0], at[1]) };
    },
    provideRenameEdits(model, position, newName) {
      if (!validIdentifier(newName)) return { edits: [], rejectReason: `"${newName}" is not a valid name.` };
      const a = analysisFor(model);
      const b = a && bindingAt(a, model.getOffsetAt(position));
      if (!b) return { edits: [] };
      const versionId = model.getVersionId();
      return {
        edits: [b.site, ...b.uses].map((r) => ({
          resource: model.uri,
          versionId,
          textEdit: { range: rangeOf(model, r), text: newName },
        })),
      };
    },
  });

  monaco.languages.registerCompletionItemProvider(lang, {
    provideCompletionItems(model, position, context) {
      // Automatic suggestions follow the setting; Ctrl+Space always works.
      if (!getState().prefs.suggestions && context.triggerKind !== monaco.languages.CompletionTriggerKind.Invoke) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const s = states.get(model);
      const exports = (s?.language && exportsByLanguage.get(s.language)) || [];
      const list = candidates(s?.analysis ?? null, exports, model.getValue(), model.getOffsetAt(position));
      // Teaching languages provide even their functions as syntax (for
      // arity checks); only the special forms are shown as keywords.
      const form = (name: string) => SPECIAL_FORMS.includes(name) || TEST_FORMS.includes(name);
      const kindOf = (c: { name: string; kind: string }) =>
        c.kind === "definition"
          ? monaco.languages.CompletionItemKind.Function
          : c.kind === "local"
            ? monaco.languages.CompletionItemKind.Variable
            : form(c.name)
              ? monaco.languages.CompletionItemKind.Keyword
              : monaco.languages.CompletionItemKind.Function;
      const detailOf = (c: { name: string; kind: string }) =>
        c.kind === "definition" ? "defined in this file" : c.kind === "local" ? "local name" : form(c.name) ? "form" : "from the language";
      return {
        suggestions: list.map((c, i) => ({
          label: c.name,
          kind: kindOf(c),
          detail: detailOf(c),
          insertText: c.name,
          range,
          // The program's own names first.
          sortText: `${c.kind === "definition" || c.kind === "local" ? "0" : "1"}${String(i).padStart(5, "0")}`,
        })),
      };
    },
  });

  // Documentation links from hovers open in a browser tab beside the code.
  monaco.editor.registerLinkOpener({
    open(resource) {
      const url = resource.toString(true);
      if (!/^https?:/.test(url)) return false;
      openWebTab(url, true);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------

let installed = false;

/** Starts checking open programs. Called once at startup. */
export function installAnalysis() {
  if (installed) return;
  installed = true;
  registerProviders();

  addEngineListener((e: EngineEvent) => {
    if (e.type === "bridge" && e.event.ev === "check-result") {
      onResult(Number(e.event.id), e.event.result);
      return true;
    }
    // Everything else from the analysis process (ready, its end) is not a Run's.
    if (e.session === analysisSession) {
      if (e.type === "session-ended") {
        for (const [, r] of inflight) stateOf(r.model).checking = false;
        inflight.clear();
        early.clear();
      }
      return true;
    }
    return false;
  });

  const watch = (model: monaco.editor.ITextModel) => {
    if (model.getLanguageId() !== RACKET_LANGUAGE_ID) return;
    model.onDidChangeContent(() => schedule(model));
    model.onWillDispose(() => {
      const s = states.get(model);
      if (s?.timer) window.clearTimeout(s.timer);
    });
    schedule(model, 100);
  };
  for (const m of monaco.editor.getModels()) watch(m);
  monaco.editor.onDidCreateModel(watch);

  // Highlighting settings redraw the markers.
  let shown = "";
  subscribe(() => {
    const p = getState().prefs;
    const key = `${p.fadeUnused}|${p.inlineErrors}`;
    if (key === shown) return;
    shown = key;
    for (const d of getState().docs) {
      const s = states.get(d.model);
      if (s && s.text && !d.model.isDisposed() && d.model.getValue() === s.text) setMarkers(d.model, s.text, s);
    }
  });

  // Check again when checking is turned on, Racket becomes ready, or a file
  // gets a path (Save As) or a new language.
  let last = { on: enabled(), docs: "" };
  subscribe(() => {
    const on = enabled();
    const docs = getState()
      .docs.map((d) => `${d.id}:${d.path}:${d.language.id}:${d.language.langLine}`)
      .join("|");
    if (on !== last.on || docs !== last.docs) {
      const turnedOff = last.on && !on;
      last = { on, docs };
      for (const d of getState().docs) {
        if (turnedOff) clear(d.model);
        else if (on) schedule(d.model, 50);
      }
    }
  });
}
