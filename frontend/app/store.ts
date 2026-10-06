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
import { TERMS_VERSION } from "@frontend/legal/terms";
import { parseAnnouncements, pendingAnnouncements, todayString, type Announcement } from "./announcements";
import { modnameFor, newFileText, renameGeneratedHeader, NEW_FILE_LANGUAGES } from "@frontend/workspace/new-file";
import { detectLanguage } from "@frontend/workspace/language";
import { languageChangeEdit } from "@frontend/workspace/change-language";
import * as L from "@frontend/workbench/layout";
import { isWithin, rebase } from "@frontend/explorer/paths";

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

/** A bottom panel id (frontend/workbench/panels.tsx). */
export type PanelTab = string;

export interface Notice {
  id: number;
  kind: "info" | "warning" | "error";
  text: string;
}

/** The unsaved-changes prompt: which files, and whether closing or quitting. */
export interface UnsavedPrompt {
  kind: "close" | "quit";
  names: string[];
}

export type UnsavedChoice = "save" | "discard" | "cancel";

/** A browser tab (frontend/browser): a web page in an editor group. Its id
 * starts with "web-", so layouts tell it apart from documents. */
export interface WebTab {
  id: string;
  /** The page shown, or "" before an address is entered. */
  url: string;
  title: string;
  loading: boolean;
}

export function isWebTabId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("web-");
}

export interface AppState {
  docs: Doc[];
  /** Browser tabs; they live in editor groups like documents. */
  webTabs: WebTab[];
  /** The document in the active editor group; kept in step with `layout`. */
  activeId: string | null;
  /** Editor groups and their split layout. */
  layout: L.EditorLayout;
  /** The bottom panel fills the workbench. */
  panelMaximized: boolean;
  /** Zen mode: only the editor is shown. */
  zen: boolean;
  /** Shown while closing or quitting with unsaved files. */
  unsaved: UnsavedPrompt | null;
  /** The page shown when Settings opens. */
  settingsPage: string;
  runtime: RuntimeStatus;
  prefs: Preferences;
  run: RunState;
  stepper: StepperState;
  panel: PanelTab;
  notices: Notice[];
  recentFiles: string[];
  /** Folder shown in the Explorer. */
  folder: string | null;
  dialog: null | "new-file" | "runtime" | "about" | "settings" | "update" | "setup" | "announcement" | "terms" | "compute-hosts";
  /** Announcements waiting to be shown. */
  announcements: Announcement[];
  /** Bumped when model content changes, so dirty markers re-render. */
  revision: number;
}

let state: AppState = {
  docs: [],
  webTabs: [],
  activeId: null,
  layout: L.initialLayout(),
  panelMaximized: false,
  zen: false,
  unsaved: null,
  settingsPage: "general",
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

/** Calls `listener` after every state change. Returns a function that unsubscribes. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
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

/** Sets the editor layout; `activeId` follows its active tab. */
function setLayout(layout: L.EditorLayout, extra: Partial<AppState> = {}) {
  set({ ...extra, layout, activeId: L.activeTab(layout) });
}

/** Paths of recently closed editors, newest last. */
const closedPaths: string[] = [];

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

let keepFocus = false;

/** False once after a document was opened with `preserveFocus` (the
 * Explorer keeps the keyboard when a click opens a file). */
export function editorMayTakeFocus(): boolean {
  const ok = !keepFocus;
  keepFocus = false;
  return ok;
}

export async function openPath(path: string, opts: { preserveFocus?: boolean } = {}) {
  keepFocus = !!opts.preserveFocus;
  const existing = state.docs.find((d) => d.path === path);
  if (existing) {
    setLayout(L.openTab(state.layout, existing.id));
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
    setLayout(L.openTab(state.layout, doc.id), {
      docs: [...state.docs, doc],
      recentFiles: [opened.path, ...state.recentFiles.filter((p) => p !== opened.path)].slice(0, 15),
    });
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
  watchFolder(path);
}

let webSeq = 1;

/** Opens a browser tab (empty: it asks for an address). `toSide` opens it in
 * a new group to the right of the active one, beside the code. */
export function openWebTab(url = "", toSide = false): string {
  const tab: WebTab = { id: `web-${webSeq++}`, url, title: url ? url : "New Tab", loading: !!url };
  const layout = toSide && state.layout.groups[state.layout.activeGroup]?.tabs.length
    ? L.splitGroup(state.layout, state.layout.activeGroup, "right", tab.id)
    : L.openTab(state.layout, tab.id);
  setLayout(layout, { webTabs: [...state.webTabs, tab] });
  return tab.id;
}

export function updateWebTab(id: string, patch: Partial<WebTab>) {
  if (!state.webTabs.some((t) => t.id === id)) return;
  set((s) => ({ webTabs: s.webTabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

/** Remembers an address for the address bar's suggestions. */
export function rememberWebAddress(url: string) {
  const recent = [url, ...state.prefs.browserRecent.filter((u) => u !== url)].slice(0, 12);
  setPrefs({ browserRecent: recent });
}

function closeWebTab(id: string) {
  void backend.browserClose(id).catch(() => {});
  setLayout(L.removeDoc(state.layout, id), { webTabs: state.webTabs.filter((t) => t.id !== id) });
}

/** Watches the open folder so the Explorer shows changes made anywhere. */
function watchFolder(path: string | null) {
  backend.watchFolder(path).catch((e) => path && notify("warning", `Changes in the folder will not appear automatically: ${e}`));
}

/** Open documents follow a file or folder renamed or moved in the Explorer. */
export function followMove(from: string, to: string) {
  const moved = state.docs.filter((d) => d.path && isWithin(d.path, from));
  for (const d of moved) {
    d.path = rebase(d.path!, from, to);
    d.name = fileName(d.path);
  }
  set((s) => ({
    docs: moved.length ? [...s.docs] : s.docs,
    recentFiles: s.recentFiles.map((p) => (isWithin(p, from) ? rebase(p, from, to) : p)),
  }));
}

/** Closes the tabs of a file or folder the Explorer moved to the Recycle Bin.
 * The Explorer has already asked about unsaved changes. */
export function forgetDeleted(path: string) {
  const gone = state.docs.filter((d) => d.path && isWithin(d.path, path));
  if (gone.length === 0) return;
  let layout = state.layout;
  for (const d of gone) {
    void backend.closeSource(d.path!);
    layout = L.removeDoc(layout, d.id);
  }
  setLayout(layout, { docs: state.docs.filter((d) => !gone.includes(d)) });
  for (const d of gone) d.model.dispose();
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
  setLayout(L.openTab(state.layout, doc.id), { docs: [...state.docs, doc], dialog: null });
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

let resolveUnsaved: ((choice: UnsavedChoice) => void) | null = null;

/** Asks what to do with unsaved files (the dialog is in Dialogs.tsx). */
function askUnsaved(prompt: UnsavedPrompt): Promise<UnsavedChoice> {
  resolveUnsaved?.("cancel");
  return new Promise((resolve) => {
    resolveUnsaved = resolve;
    set({ unsaved: prompt });
  });
}

/** Called by the unsaved-changes dialog. */
export function answerUnsaved(choice: UnsavedChoice) {
  const resolve = resolveUnsaved;
  resolveUnsaved = null;
  set({ unsaved: null });
  resolve?.(choice);
}

export async function closeDoc(doc: Doc): Promise<boolean> {
  if (isDirty(doc)) {
    // Show the file being asked about, in a group that already has it.
    const group = Object.values(state.layout.groups).find((g) => g.tabs.includes(doc.id));
    setLayout(L.openTab(state.layout, doc.id, group?.id));
    const choice = await askUnsaved({ kind: "close", names: [doc.name] });
    if (choice === "cancel") return false;
    if (choice === "save" && !(await saveDoc(doc))) return false;
  }
  if (doc.path) {
    void backend.closeSource(doc.path);
    closedPaths.push(doc.path);
    if (closedPaths.length > 20) closedPaths.shift();
  }
  setLayout(L.removeDoc(state.layout, doc.id), { docs: state.docs.filter((d) => d.id !== doc.id) });
  doc.model.dispose();
  return true;
}

/** Closes a tab. The document closes only when no other group shows it. */
export async function closeTab(groupId: string, docId: string): Promise<boolean> {
  const elsewhere = Object.values(state.layout.groups).some((g) => g.id !== groupId && g.tabs.includes(docId));
  if (elsewhere) {
    setLayout(L.closeTab(state.layout, groupId, docId));
    return true;
  }
  if (isWebTabId(docId)) {
    closeWebTab(docId);
    return true;
  }
  const doc = state.docs.find((d) => d.id === docId);
  return doc ? closeDoc(doc) : true;
}

/** Closes several tabs of a group, stopping if the user cancels. */
async function closeTabs(groupId: string, docIds: string[]): Promise<boolean> {
  for (const id of docIds) if (!(await closeTab(groupId, id))) return false;
  return true;
}

export function closeOtherTabs(groupId: string, docId: string) {
  const g = state.layout.groups[groupId];
  return g ? closeTabs(groupId, g.tabs.filter((t) => t !== docId)) : Promise.resolve(true);
}

export function closeTabsToRight(groupId: string, docId: string) {
  const g = state.layout.groups[groupId];
  return g ? closeTabs(groupId, g.tabs.slice(g.tabs.indexOf(docId) + 1)) : Promise.resolve(true);
}

/** Closes every tab of a group, then the group itself. */
export async function closeGroup(groupId: string = state.layout.activeGroup) {
  const g = state.layout.groups[groupId];
  if (!g) return;
  if (await closeTabs(groupId, [...g.tabs])) setLayout(L.removeGroup(state.layout, groupId));
}

export async function closeAllEditors() {
  for (const d of [...state.docs]) if (!(await closeDoc(d))) return;
}

/** Reopens the most recently closed file. */
export async function reopenClosedEditor() {
  const path = closedPaths.pop();
  if (path) await openPath(path);
}

export function canReopenClosedEditor(): boolean {
  return closedPaths.length > 0;
}

export function splitEditor(direction: L.SplitDirection, groupId: string = state.layout.activeGroup) {
  const g = state.layout.groups[groupId];
  if (!g) return;
  // A web page can be shown in one place only: splitting moves it beside the code.
  if (isWebTabId(g.active)) return setLayout(L.moveToNewGroup(state.layout, groupId, g.active!, direction));
  setLayout(L.splitGroup(state.layout, groupId, direction, g.active));
}

export function moveTab(from: string, to: string, docId: string, index?: number) {
  setLayout(L.moveTab(state.layout, from, to, docId, index));
}

export function moveTabToNewGroup(groupId: string, docId: string, direction: L.SplitDirection) {
  setLayout(L.moveToNewGroup(state.layout, groupId, docId, direction));
}

export function applyEditorLayout(preset: L.LayoutPreset) {
  setLayout(L.applyPreset(state.layout, preset));
}

export function focusGroup(groupId: string) {
  if (groupId !== state.layout.activeGroup) setLayout(L.focusGroup(state.layout, groupId));
}

/** Focuses the next (or previous) editor group in reading order. */
export function focusAdjacentGroup(delta: number) {
  const order = L.groupOrder(state.layout);
  const i = order.indexOf(state.layout.activeGroup);
  focusGroup(order[(i + delta + order.length) % order.length]);
}

export function activateTab(groupId: string, docId: string) {
  setLayout(L.openTab(state.layout, docId, groupId));
}

export function resizeEditorSplit(splitId: string, sizes: number[]) {
  set({ layout: L.resizeSplit(state.layout, splitId, sizes) });
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

/** Shows a document in the active editor group. */
export function activate(id: string) {
  setLayout(L.openTab(state.layout, id));
}

const autosaveTimers = new Map<string, number>();
function scheduleAutosave(doc: Doc) {
  if (state.prefs.autosave !== "afterDelay" || !doc.path) return;
  window.clearTimeout(autosaveTimers.get(doc.id));
  autosaveTimers.set(
    doc.id,
    window.setTimeout(() => autosaveNow(doc), state.prefs.autosaveDelay),
  );
}

/** Saves a document that has a file, unless its language header was edited
 * (that save asks for confirmation, so it is never automatic). */
function autosaveNow(doc: Doc) {
  if (doc.path && !doc.model.isDisposed() && isDirty(doc) && !headerChanged(doc)) void saveDoc(doc);
}

/** "When the editor loses focus": called by the editor groups. */
export function autosaveOnEditorBlur(docId: string) {
  if (state.prefs.autosave !== "onFocusChange") return;
  const doc = state.docs.find((d) => d.id === docId);
  if (doc) autosaveNow(doc);
}

/** "When the window loses focus". */
function autosaveOnWindowBlur() {
  if (state.prefs.autosave === "onWindowChange" || state.prefs.autosave === "onFocusChange") {
    for (const d of state.docs) autosaveNow(d);
  }
}

// ---------------------------------------------------------------------------
// Run / Interactions

/** Engine events for sessions not yet known (the run invoke may resolve
 * after its first events arrive). */
const early = new Map<number, EngineEvent[]>();

/** Re-renders views that derive from editor state outside the store (badges). */
export function bumpRevision() {
  set((s) => ({ revision: s.revision + 1 }));
}

const engineListeners = new Set<(e: EngineEvent) => boolean>();

/** Sees every engine event first (background analysis, the debugger). A
 * listener returning true consumes the event. */
export function addEngineListener(l: (e: EngineEvent) => boolean): () => void {
  engineListeners.add(l);
  return () => engineListeners.delete(l);
}

function handleEngineEvent(e: EngineEvent) {
  for (const l of engineListeners) if (l(e)) return;
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

/** Runs the active file. With `breakpoints` (1-based lines) it runs under
 * the debugger (frontend/debug). */
export async function runActive(breakpoints?: number[]) {
  const doc = activeDoc();
  if (!doc) return;
  if (state.runtime.state !== "ready") {
    notify("warning", "Racket is not ready.");
    return;
  }
  try {
    const runVersion = doc.model.getAlternativeVersionId();
    const handle = breakpoints
      ? await backend.debug(doc.path, doc.model.getValue(), breakpoints)
      : await backend.run(doc.path, doc.model.getValue());
    set((s) => ({
      run: startRun(s.run, { ...handle, docId: doc.id, path: doc.path, runVersion }),
      panel: s.panel === "output" || s.panel === "stepper" ? "interactions" : s.panel,
    }));
    for (const e of takeEarly(handle.session)) handleEngineEvent(e);
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

/** Shows a bottom panel (opening the panel area if it is hidden). */
export function setPanel(panel: PanelTab) {
  set({ panel });
  if (!state.prefs.panelVisible) setPrefs({ panelVisible: true });
}

export function togglePanelMaximized() {
  set((s) => ({ panelMaximized: !s.panelMaximized }));
  if (!state.prefs.panelVisible) setPrefs({ panelVisible: true });
}

export function toggleZen() {
  set((s) => ({ zen: !s.zen }));
}

/** Closes the folder shown in the Explorer. */
export function closeFolder() {
  setFolder(null);
}

/** Opens Settings at a page ("general", "appearance", "editor", "files", "keyboard"). */
export function openSettings(page = state.settingsPage) {
  set({ settingsPage: page });
  setDialog("settings");
}

export function setSettingsPage(page: string) {
  set({ settingsPage: page });
}

export function setDialog(dialog: AppState["dialog"]) {
  // Nothing else opens until the current Beta Terms are accepted.
  if (state.dialog === "setup" && state.prefs.termsAccepted !== TERMS_VERSION && dialog !== "setup") return;
  set({ dialog });
}

export function termsAccepted(s: AppState = state): boolean {
  return s.prefs.termsAccepted === TERMS_VERSION;
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
  window.addEventListener("blur", autosaveOnWindowBlur);
  await backend.onRuntimeStatus((runtime) => set({ runtime }));
  set({ runtime: await backend.runtimeStatus() });
  const settings = await backend.settings();
  const prefs = mergePreferences(settings.ui);
  set({
    prefs,
    recentFiles: settings.recentFiles,
    folder: settings.workspaceFolder,
    // First launch, or new Terms: one Setup dialog with clean defaults.
    dialog: prefs.setupDone && prefs.termsAccepted === TERMS_VERSION ? null : "setup",
  });
  if (settings.workspaceFolder) watchFolder(settings.workspaceFolder);
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
  const choice = await askUnsaved({ kind: "quit", names: dirty.map((d) => d.name) });
  if (choice === "cancel") return false;
  if (choice === "save") {
    for (const d of dirty) if (!(await saveDoc(d))) return false;
  }
  return true;
}
