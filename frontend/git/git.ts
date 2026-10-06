// Source control state: the repository that contains the open folder, its
// status (refreshed when files change, after every operation and when the
// window gets focus), operations, change markers in the editor's margin, and
// opening diffs. All Git work happens in backend/src/git.rs with the user's
// own `git`.

import { useSyncExternalStore } from "react";
import type { GitStatus } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { monaco } from "@frontend/editor/monaco";
import { getState, notify, openDiffTab, openPath, subscribe, updateDiffTab, type Doc } from "@frontend/app/store";
import { isWithin, relativeTo, samePath } from "@frontend/explorer/paths";
import { lineChanges } from "./linediff";

export interface GitState {
  /** null: not checked yet. */
  available: boolean | null;
  /** null: the open folder is not in a repository (or Git is off). */
  status: GitStatus | null;
  /** An operation in progress ("Committing…"). */
  busy: string | null;
}

let state: GitState = { available: null, status: null, busy: null };
const listeners = new Set<() => void>();

function set(patch: Partial<GitState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function gitState(): GitState {
  return state;
}

export function useGit<T>(select: (s: GitState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

function folder(): string | null {
  return getState().prefs.git ? getState().folder : null;
}

// --- refresh -----------------------------------------------------------------

let timer = 0;
let running: Promise<void> | null = null;
let again = false;

export function refresh(delay = 250) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void doRefresh(), delay);
}

async function doRefresh() {
  if (running) {
    again = true;
    return;
  }
  running = (async () => {
    const dir = folder();
    if (!dir) {
      set({ status: null });
      return;
    }
    if (state.available === null) {
      try {
        await backend.gitVersion();
        set({ available: true });
      } catch {
        set({ available: false, status: null });
        return;
      }
    }
    try {
      const status = await backend.gitStatus(dir);
      const headChanged = status?.head !== state.status?.head || status?.root !== state.status?.root;
      if (headChanged) headCache.clear();
      set({ status });
      updateGutters();
      if (headChanged) void refreshOpenDiffs(dir);
    } catch (e) {
      if (/not installed/i.test(String(e))) set({ available: false, status: null });
    }
  })();
  await running;
  running = null;
  if (again) {
    again = false;
    refresh(100);
  }
}

// --- per-file status ----------------------------------------------------------

/** "M", "A", "D", "R", "U", "?" (untracked) or null, for a file. */
export function fileStatus(path: string): string | null {
  const f = state.status?.files.find((x) => samePath(x.abs, path));
  if (!f) return null;
  if (f.index === "U" || f.worktree === "U") return "U";
  if (f.worktree === "?") return "?";
  return f.worktree !== "." ? f.worktree : f.index;
}

/** True if a folder contains changed files. */
export function folderChanged(path: string): boolean {
  return !!state.status?.files.some((f) => isWithin(f.abs, path) && !samePath(f.abs, path));
}

// --- operations -----------------------------------------------------------------

async function op<T>(label: string, f: (dir: string) => Promise<T>): Promise<T | undefined> {
  const dir = folder();
  if (!dir) return undefined;
  set({ busy: label });
  try {
    return await f(dir);
  } catch (e) {
    notify("error", String(e).replace(/^Error:\s*/, ""));
    return undefined;
  } finally {
    set({ busy: null });
    refresh(0);
  }
}

export const stage = (paths: string[]) => op("Staging…", (d) => backend.gitStage(d, paths));
export const unstage = (paths: string[]) => op("Unstaging…", (d) => backend.gitUnstage(d, paths));
export const discard = (paths: string[]) => op("Discarding…", (d) => backend.gitDiscard(d, paths));
export const init = () => op("Creating the repository…", (d) => backend.gitInit(d));
export const switchBranch = (name: string) => op(`Switching to ${name}…`, (d) => backend.gitSwitch(d, name));
export const createBranch = (name: string) => op(`Creating ${name}…`, (d) => backend.gitCreateBranch(d, name));

/** Moves untracked files to the Recycle Bin (Git cannot restore them). */
export const trashUntracked = (paths: string[]) =>
  op("Deleting…", async () => {
    const root = state.status!.root;
    for (const p of paths) await backend.fsTrash(root, p);
  });

export async function commit(message: string, all: boolean): Promise<boolean> {
  const done = await op("Committing…", async (d) => {
    if (all) await backend.gitStage(d, state.status!.files.map((f) => f.abs));
    return backend.gitCommit(d, message);
  });
  if (done) notify("info", `Committed ${done}.`);
  return !!done;
}

export async function sync(kind: "fetch" | "pull" | "push") {
  const label = { fetch: "Fetching…", pull: "Pulling…", push: "Pushing…" }[kind];
  const out = await op(label, (d) => backend.gitSync(d, kind));
  if (out !== undefined) notify("info", { fetch: "Fetched.", pull: "Pulled.", push: "Pushed." }[kind]);
}

// --- HEAD versions, margin markers, diffs ---------------------------------------

const headCache = new Map<string, Promise<string | null>>();

function headText(path: string): Promise<string | null> {
  const dir = folder();
  if (!dir) return Promise.resolve(null);
  const key = path.toLowerCase();
  let p = headCache.get(key);
  if (!p) {
    p = backend.gitShow(dir, "HEAD", path).catch(() => null);
    headCache.set(key, p);
  }
  return p;
}

const gutterIds = new WeakMap<monaco.editor.ITextModel, string[]>();
const gutterTimers = new WeakMap<monaco.editor.ITextModel, number>();

function inRepo(path: string | null): path is string {
  return !!path && !!state.status && isWithin(path, state.status.root);
}

async function updateGutter(doc: Doc) {
  const model = doc.model;
  if (model.isDisposed()) return;
  const show = getState().prefs.gitGutter && inRepo(doc.path) && fileStatus(doc.path!) !== "?";
  const base = show ? await headText(doc.path!) : null;
  if (model.isDisposed()) return;
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  if (base !== null) {
    for (const c of lineChanges(base, model.getValue())) {
      if (c.kind === "deleted") {
        const line = Math.max(c.after, 1);
        decorations.push({ range: new monaco.Range(line, 1, line, 1), options: { linesDecorationsClassName: c.after === 0 ? "git-deleted top" : "git-deleted" } });
      } else {
        decorations.push({
          range: new monaco.Range(c.from, 1, c.to, 1),
          options: { isWholeLine: true, linesDecorationsClassName: c.kind === "added" ? "git-added" : "git-modified" },
        });
      }
    }
  }
  gutterIds.set(model, model.deltaDecorations(gutterIds.get(model) ?? [], decorations));
}

function updateGutters() {
  for (const d of getState().docs) void updateGutter(d);
}

function scheduleGutter(doc: Doc) {
  window.clearTimeout(gutterTimers.get(doc.model));
  gutterTimers.set(doc.model, window.setTimeout(() => void updateGutter(doc), 250));
}

/** Diffs against the last commit follow a new commit (or a branch switch). */
async function refreshOpenDiffs(dir: string) {
  for (const t of getState().diffTabs) {
    if (!t.key.startsWith("changes:HEAD:") || !t.right.path) continue;
    const text = (await backend.gitShow(dir, "HEAD", t.right.path).catch(() => null)) ?? "";
    updateDiffTab(t.id, { left: { ...t.left, text } });
  }
}

/** Opens a diff of a working file against HEAD (or the index), live on the right. */
export async function openChanges(path: string, against: "HEAD" | "" = "HEAD") {
  const dir = folder();
  if (!dir) return;
  const left = (await backend.gitShow(dir, against, path).catch(() => null)) ?? "";
  const name = path.split(/[\\/]/).pop()!;
  // The right side is the open document (live and editable): open it first.
  if (!getState().docs.some((d) => samePath(d.path, path))) await openPath(path, { preserveFocus: true });
  openDiffTab({
    key: `changes:${against}:${path.toLowerCase()}`,
    title: `${name} (${against === "HEAD" ? "changes" : "staged"})`,
    left: { label: against === "HEAD" ? `${name} · last commit` : `${name} · staged`, text: left },
    right: { label: `${name} · working copy`, text: null, path },
  });
}

/** Opens what a commit changed in one file (compared with its parent). */
export async function openCommitFile(sha: string, short: string, path: string) {
  const dir = folder();
  if (!dir) return;
  const [before, after] = await Promise.all([backend.gitShow(dir, `${sha}^`, path).catch(() => null), backend.gitShow(dir, sha, path).catch(() => null)]);
  const name = path.split(/[\\/]/).pop()!;
  openDiffTab({
    key: `commit:${sha}:${path.toLowerCase()}`,
    title: `${name} (${short})`,
    left: { label: `${name} · before ${short}`, text: before ?? "" },
    right: { label: `${name} · ${short}`, text: after ?? "", path: null },
  });
}

export function repoRelative(path: string): string {
  return state.status ? relativeTo(path, state.status.root) : path;
}

// ---------------------------------------------------------------------------

let installed = false;

export function installGit() {
  if (installed) return;
  installed = true;
  void backend.onFolderChanged(() => refresh(400));
  window.addEventListener("focus", () => refresh(100));
  let last = "";
  const watched = new WeakSet<monaco.editor.ITextModel>();
  subscribe(() => {
    const s = getState();
    const key = `${s.prefs.git}|${s.folder}|${s.prefs.gitGutter}`;
    if (key !== last) {
      last = key;
      headCache.clear();
      refresh(0);
    }
    for (const d of s.docs) {
      if (watched.has(d.model)) continue;
      watched.add(d.model);
      d.model.onDidChangeContent(() => scheduleGutter(d));
      void updateGutter(d);
    }
  });
}

/** The open file's path relative to the repository, for titles. */
export function describe(path: string): string {
  return inRepo(path) ? repoRelative(path) : path;
}
