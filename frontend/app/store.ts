// Application state and actions. UI components read state through
// `useApp` and call the actions below; only this module talks to the backend.

import { useSyncExternalStore } from "react";
import { ask, message, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { EngineEvent, LanguageSummary, LineEnding, RuntimeStatus } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID } from "@frontend/editor/racket-language";
import { sameSourcePath, srclocToRange } from "@frontend/editor/srcloc";
import {
  addInput,
  applyBridgeEvent,
  endSession,
  initialRunState,
  inputFailed,
  startRun,
  trackRequest,
  type RunState,
} from "@frontend/run/session";
import { DEFAULT_PREFERENCES, mergePreferences, type Preferences } from "@frontend/settings/preferences";
import {
  applyStepperEvent,
  endStepper,
  goToStep,
  initialStepperState,
  startStepper,
  type StepperState,
} from "@frontend/stepper/stepper-state";
import { profileById, type CourseProfile } from "@shared/models/profiles";
import { parseAnnouncements, pendingAnnouncements, todayString, type Announcement } from "./announcements";
import { modnameFor, newFileText, renameGeneratedHeader, NEW_FILE_LANGUAGES } from "@frontend/workspace/new-file";
import { detectLanguage } from "@frontend/workspace/language";
import { languageChangeEdit } from "@frontend/workspace/change-language";

export interface Doc {
  id: string;
  path: string | null;
  name: string;
  model: monaco.editor.ITextModel;
  /** Alternative version id at the last open/save; dirty when different. */
  savedVersion: number;
  language: LanguageSummary;
  lineEnding: LineEnding;
  hasBom: boolean;
  /** The metadata lines as opened, to detect edits to the language header. */
  originalHeader: string | null;
  /** Set for new files whose header PhDRacket generated at the user's request. */
  generated?: { languageId: string; modname: string };
}

export type PanelTab = "problems" | "tests" | "interactions" | "stepper" | "output";

export interface Notice {
  id: number;
  kind: "info" | "warning" | "error";
  text: string;
}

export interface AppState {
  docs: Doc[];
  activeId: string | null;
  runtime: RuntimeStatus;
  prefs: Preferences;
  run: RunState;
  stepper: StepperState;
  panel: PanelTab;
  notices: Notice[];
  recentFiles: string[];
  /** Folder shown in the Explorer. */
  folder: string | null;
  dialog: null | "new-file" | "runtime" | "about" | "settings" | "update" | "setup" | "announcement";
  /** Announcements waiting to be shown. */
  announcements: Announcement[];
  /** Bumped when model content changes, so dirty markers re-render. */
  revision: number;
}

let state: AppState = {
  docs: [],
  activeId: null,
  runtime: { state: "detecting", runtime: null, message: null },
  prefs: DEFAULT_PREFERENCES,
  run: initialRunState,
  stepper: initialStepperState,
  panel: "interactions",
  notices: [],
  recentFiles: [],
  folder: null,
  dialog: null,
  announcements: [],
  revision: 0,
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

// ---------------------------------------------------------------------------
// Notices

let noticeId = 1;
export function notify(kind: Notice["kind"], text: string) {
  const n = { id: noticeId++, kind, text };
  set((s) => ({ notices: [...s.notices.slice(-3), n] }));
  if (kind !== "error") setTimeout(() => dismissNotice(n.id), 6000);
}
export function dismissNotice(id: number) {
  set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
}

// ---------------------------------------------------------------------------
// Documents

let docSeq = 1;

export function activeDoc(s: AppState = state): Doc | null {
  return s.docs.find((d) => d.id === s.activeId) ?? null;
}

export function isDirty(d: Doc): boolean {
  return d.model.getAlternativeVersionId() !== d.savedVersion;
}

function headerOf(model: monaco.editor.ITextModel, lines: number): string | null {
  if (lines <= 0 || model.getLineCount() < lines) return null;
  return Array.from({ length: lines }, (_, i) => model.getLineContent(i + 1)).join("\n");
}

/** True if the user has edited the DrRacket metadata lines since opening. */
export function headerChanged(d: Doc): boolean {
  if (d.originalHeader === null) return false;
  return headerOf(d.model, d.language.metadataLines) !== d.originalHeader;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function createDoc(init: Omit<Doc, "id" | "model" | "savedVersion"> & { text: string }): Doc {
  const uri = monaco.Uri.from({ scheme: "phdracket", path: `/${docSeq}/${init.name}` });
  const model = monaco.editor.createModel(init.text, RACKET_LANGUAGE_ID, uri);
  // The backend hands us LF text and re-applies the file's line endings.
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  const doc: Doc = {
    id: `doc-${docSeq++}`,
    model,
    savedVersion: model.getAlternativeVersionId(),
    path: init.path,
    name: init.name,
    language: init.language,
    lineEnding: init.lineEnding,
    hasBom: init.hasBom,
    originalHeader: init.originalHeader,
    generated: init.generated,
  };
  model.onDidChangeContent(() => {
    // Keep the displayed language in step with the declaration being edited.
    const language = detectLanguage(model.getValue());
    const changed =
      language.kind !== doc.language.kind || language.id !== doc.language.id || language.langLine !== doc.language.langLine;
    if (changed) doc.language = language;
    set((s) => ({ revision: s.revision + 1, docs: changed ? [...s.docs] : s.docs }));
    scheduleAutosave(doc);
  });
  return doc;
}

export async function openPath(path: string) {
  const existing = state.docs.find((d) => d.path === path);
  if (existing) {
    set({ activeId: existing.id });
    return;
  }
  try {
    const opened = await backend.openSource(path);
    const doc = createDoc({
      path: opened.path,
      name: fileName(opened.path),
      text: opened.text,
      language: opened.language,
      lineEnding: opened.lineEnding,
      hasBom: opened.hasBom,
      originalHeader: null,
    });
    doc.originalHeader = headerOf(doc.model, opened.language.metadataLines);
    set((s) => ({
      docs: [...s.docs, doc],
      activeId: doc.id,
      recentFiles: [opened.path, ...s.recentFiles.filter((p) => p !== opened.path)].slice(0, 15),
    }));
  } catch (e) {
    await message(String(e), { title: "Cannot open file", kind: "error" });
  }
}

export async function openWithDialog() {
  const picked = await openDialog({
    multiple: true,
    filters: [
      { name: "Racket source", extensions: ["rkt", "rktl", "scm", "ss"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  for (const p of paths) await openPath(p);
}

export async function openFolderWithDialog() {
  const picked = await openDialog({ directory: true, multiple: false, title: "Open Folder" });
  if (typeof picked === "string") setFolder(picked);
}

export function setFolder(path: string | null) {
  set((s) => ({ folder: path, prefs: path ? { ...s.prefs, explorerVisible: true } : s.prefs }));
  void backend.setWorkspaceFolder(path);
}

export function toggleExplorer() {
  setPrefs({ explorerVisible: !state.prefs.explorerVisible });
}

/** Creates an untitled file in a language the user explicitly chose. */
export function newFile(languageId: string) {
  const lang = NEW_FILE_LANGUAGES.find((l) => l.id === languageId)!;
  const text = newFileText(languageId, "untitled");
  const language: LanguageSummary = lang.reader
    ? { kind: "teaching", id: lang.id, name: lang.name, short: lang.short, langLine: null, metadataLines: 3 }
    : { kind: "module", id: null, name: `#lang ${lang.lang}`, short: lang.short, langLine: lang.lang!, metadataLines: 0 };
  const doc = createDoc({
    path: null,
    name: `untitled-${docSeq}.rkt`,
    text,
    language,
    lineEnding: "lf",
    hasBom: false,
    originalHeader: null,
    generated: lang.reader ? { languageId, modname: "untitled" } : undefined,
  });
  doc.originalHeader = headerOf(doc.model, language.metadataLines);
  // A brand-new file is unsaved: mark it dirty.
  doc.savedVersion = -1;
  set((s) => ({ docs: [...s.docs, doc], activeId: doc.id, dialog: null }));
}

export async function saveDoc(doc: Doc | null = activeDoc(), forceDialog = false): Promise<boolean> {
  if (!doc) return false;
  if (headerChanged(doc)) {
    const ok = await ask("The language metadata (lines 1 to 3) was edited. Save anyway?", {
      title: "Language metadata changed",
      kind: "warning",
      okLabel: "Save",
    });
    if (!ok) return false;
  }
  try {
    if (doc.path && !forceDialog) {
      await backend.saveSource(doc.path, doc.model.getValue());
    } else {
      const target = await saveDialog({
        defaultPath: doc.path ?? doc.name,
        filters: [{ name: "Racket source", extensions: ["rkt"] }],
      });
      if (!target) return false;
      let text = doc.model.getValue();
      if (doc.generated) {
        const renamed = renameGeneratedHeader(text, doc.generated.languageId, doc.generated.modname, modnameFor(fileName(target)));
        if (renamed !== null) {
          doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: renamed }], () => null);
          doc.generated = { ...doc.generated, modname: modnameFor(fileName(target)) };
          text = renamed;
        }
      }
      await backend.saveSourceAs(doc.path, target, text);
      doc.path = target;
      doc.name = fileName(target);
    }
    doc.savedVersion = doc.model.getAlternativeVersionId();
    doc.originalHeader = headerOf(doc.model, doc.language.metadataLines);
    set((s) => ({ revision: s.revision + 1, docs: [...s.docs] }));
    return true;
  } catch (e) {
    await message(String(e), { title: "Cannot save file", kind: "error" });
    return false;
  }
}

export async function closeDoc(doc: Doc): Promise<boolean> {
  if (isDirty(doc)) {
    const discard = await ask(`${doc.name} has unsaved changes. Close without saving?`, {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Close without saving",
      cancelLabel: "Cancel",
    });
    if (!discard) return false;
  }
  if (doc.path) void backend.closeSource(doc.path);
  doc.model.dispose();
  set((s) => {
    const idx = s.docs.findIndex((d) => d.id === doc.id);
    const docs = s.docs.filter((d) => d.id !== doc.id);
    const activeId = s.activeId === doc.id ? (docs[Math.min(idx, docs.length - 1)]?.id ?? null) : s.activeId;
    return { docs, activeId };
  });
  return true;
}

/** Choose Language: rewrite only the language declaration of the active
 * document (DrRacket's metadata lines or the `#lang` line). The edit is
 * undoable and reaches the file only when the user saves. */
export function changeLanguage(languageId: string) {
  const doc = activeDoc();
  if (!doc) return;
  const edit = languageChangeEdit(doc.model.getValue(), languageId, modnameFor(doc.name));
  if (!edit) return;
  const range =
    edit.endLine === 0
      ? new monaco.Range(edit.startLine, 1, edit.startLine, 1)
      : new monaco.Range(edit.startLine, 1, edit.endLine, doc.model.getLineMaxColumn(edit.endLine));
  doc.model.pushStackElement();
  doc.model.pushEditOperations([], [{ range, text: edit.text }], () => null);
  doc.model.pushStackElement();
  doc.language = detectLanguage(doc.model.getValue());
  // An explicit language change does not need the "metadata edited" confirmation.
  doc.originalHeader = headerOf(doc.model, doc.language.metadataLines);
  doc.generated = undefined;
  set((s) => ({ docs: [...s.docs], revision: s.revision + 1 }));
}

export function activate(id: string) {
  set({ activeId: id });
}

const autosaveTimers = new Map<string, number>();
function scheduleAutosave(doc: Doc) {
  if (!state.prefs.autosave || !doc.path) return;
  window.clearTimeout(autosaveTimers.get(doc.id));
  autosaveTimers.set(
    doc.id,
    window.setTimeout(() => {
      if (isDirty(doc) && !headerChanged(doc)) void saveDoc(doc);
    }, 1500),
  );
}

// ---------------------------------------------------------------------------
// Run / Interactions

/** Engine events for sessions not yet known (the run invoke may resolve
 * after its first events arrive). */
const early = new Map<number, EngineEvent[]>();

function handleEngineEvent(e: EngineEvent) {
  if (e.session === state.run.session) return applyEngineEvent(e);
  if (e.session === state.stepper.session) return applyStepperEngineEvent(e);
  const newest = Math.max(state.run.session ?? 0, state.stepper.session ?? 0);
  if (e.session > newest) {
    const list = early.get(e.session) ?? [];
    if (list.length < 100000) list.push(e);
    early.set(e.session, list);
    // Spare processes emit `ready` before they are used; keep only recent ones.
    if (early.size > 8) early.delete(Math.min(...early.keys()));
  }
}

function takeEarly(session: number): EngineEvent[] {
  const buffered = early.get(session) ?? [];
  early.delete(session);
  return buffered;
}

function applyStepperEngineEvent(e: EngineEvent) {
  if (e.type === "bridge") set((s) => ({ stepper: applyStepperEvent(s.stepper, e.event) }));
  else set((s) => ({ stepper: endStepper(s.stepper) }));
}

function applyEngineEvent(e: EngineEvent) {
  if (e.type === "bridge") {
    set((s) => ({ run: applyBridgeEvent(s.run, e.event) }));
    if (e.event.ev === "done" && e.event.id === state.run.runRequest) showMarkers();
  } else {
    set((s) => ({ run: endSession(s.run, e.reason, e.stderr) }));
  }
}

export async function runActive() {
  const doc = activeDoc();
  if (!doc) return;
  if (state.runtime.state !== "ready") {
    notify("warning", "Racket is not ready.");
    return;
  }
  try {
    const runVersion = doc.model.getAlternativeVersionId();
    const handle = await backend.run(doc.path, doc.model.getValue());
    set((s) => ({
      run: startRun(s.run, { ...handle, docId: doc.id, path: doc.path, runVersion }),
      panel: s.panel === "output" || s.panel === "stepper" ? "interactions" : s.panel,
    }));
    for (const e of takeEarly(handle.session)) applyEngineEvent(e);
  } catch (e) {
    notify("error", String(e));
  }
}

/** Starts the Stepper on the active document's Definitions. */
export async function stepActive() {
  const doc = activeDoc();
  if (!doc || state.runtime.state !== "ready") return;
  try {
    const version = doc.model.getAlternativeVersionId();
    const handle = await backend.step(doc.path, doc.model.getValue());
    set({ stepper: startStepper({ ...handle, docId: doc.id, version }), panel: "stepper" });
    for (const e of takeEarly(handle.session)) applyStepperEngineEvent(e);
  } catch (e) {
    notify("error", String(e));
  }
}

export function viewStep(index: number) {
  set((s) => ({ stepper: goToStep(s.stepper, index) }));
}

export function activeProfile(s: AppState = state): CourseProfile {
  return profileById(s.prefs.profile);
}

export async function evalInteraction(text: string): Promise<boolean> {
  if (state.run.session === null || state.run.status === "ended") return false;
  const session = state.run.session;
  set((s) => ({ run: addInput(s.run, text) }));
  try {
    const handle = await backend.evalInteraction(text);
    if (state.run.session === session) set((s) => ({ run: trackRequest(s.run, handle.request) }));
    return true;
  } catch (e) {
    set((s) => ({ run: inputFailed(s.run) }));
    notify("error", String(e));
    return false;
  }
}

export async function stopProgram() {
  await backend.stop();
}

export function clearInteractions() {
  set((s) => ({ run: { ...s.run, transcript: [] } }));
}

/** Places Racket's diagnostics on the editor model that was run. */
export function showMarkers() {
  const doc = state.docs.find((d) => d.id === state.run.docId);
  for (const d of state.docs) monaco.editor.setModelMarkers(d.model, "phdracket", []);
  if (!doc) return;
  const text = doc.model.getValue();
  const markers: monaco.editor.IMarkerData[] = [];
  for (const diag of state.run.diagnostics) {
    if (diag.origin !== "definitions" || !diag.srcloc) continue;
    const src = diag.srcloc.source;
    if (src !== null && doc.path && !sameSourcePath(src, doc.path)) continue;
    const range = srclocToRange(text, diag.srcloc);
    if (!range) continue;
    markers.push({
      ...range,
      severity: diag.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: `${diag.label}\n${diag.message}`,
      source: "Racket",
    });
  }
  monaco.editor.setModelMarkers(doc.model, "phdracket", markers);
}

// ---------------------------------------------------------------------------
// Preferences, panels, dialogs

export function setPrefs(patch: Partial<Preferences>) {
  set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  void backend.setUiSettings(state.prefs);
}

export function setPanel(panel: PanelTab) {
  set({ panel });
}

export function setDialog(dialog: AppState["dialog"]) {
  set({ dialog });
}

export async function selectRuntime(executable: string | null) {
  await backend.runtimeSelect(executable);
  set({ dialog: null });
}

// ---------------------------------------------------------------------------
// Startup

let initialized = false;

/** Subscribes to backend events and loads settings. Idempotent: React may
 * run mount effects twice in development. */
export async function initialize() {
  if (initialized) return;
  initialized = true;
  await backend.onEngineEvent(handleEngineEvent);
  await backend.onRuntimeStatus((runtime) => set({ runtime }));
  set({ runtime: await backend.runtimeStatus() });
  const settings = await backend.settings();
  const prefs = mergePreferences(settings.ui);
  set({
    prefs,
    recentFiles: settings.recentFiles,
    folder: settings.workspaceFolder,
    // First launch: one Setup dialog with clean defaults.
    dialog: prefs.setupDone ? null : "setup",
  });
}

/** Fetches announcements and queues the ones for this user. Quiet on failure. */
export async function loadAnnouncements() {
  if (!state.prefs.showAnnouncements) return;
  try {
    const [text, info] = await Promise.all([backend.fetchAnnouncements(), backend.appInfo()]);
    const pending = pendingAnnouncements(parseAnnouncements(text), {
      version: info.version,
      profile: state.prefs.profile,
      today: todayString(),
      seen: state.prefs.seenAnnouncements,
    });
    queueAnnouncements(pending);
  } catch {
    // Offline or unreachable: nothing to show.
  }
}

/** Queues announcements that have not been shown yet. */
export function queueAnnouncements(list: Announcement[]) {
  const fresh = list.filter((a) => !state.prefs.seenAnnouncements.includes(a.id));
  if (fresh.length > 0) set((s) => ({ announcements: [...s.announcements, ...fresh] }));
}

/** Marks the current announcement as seen and moves to the next one. */
export function dismissAnnouncement() {
  const [current, ...rest] = state.announcements;
  if (!current) return;
  setPrefs({ seenAnnouncements: [...state.prefs.seenAnnouncements, current.id].slice(-200) });
  set({ announcements: rest, dialog: null });
}

export async function confirmQuit(): Promise<boolean> {
  const dirty = state.docs.filter(isDirty);
  if (dirty.length === 0) return true;
  return ask(`${dirty.length} file(s) have unsaved changes. Quit without saving?`, {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Quit without saving",
    cancelLabel: "Cancel",
  });
}
