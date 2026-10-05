// The Explorer's own state: which folders are expanded, the selection, the
// name being edited, the cut/copy clipboard and which folders to reload.
// It lives outside React so commands, keybindings and the watcher can use it.

import { useSyncExternalStore } from "react";
import { samePath } from "./paths";

export interface Target {
  path: string;
  isDir: boolean;
}

export interface Editing {
  kind: "new-file" | "new-folder" | "rename";
  /** The folder the new entry goes in (or that holds the renamed one). */
  dir: string;
  /** Rename: the entry being renamed. */
  path?: string;
}

export interface ExplorerState {
  expanded: string[];
  selected: Target | null;
  editing: Editing | null;
  clipboard: { mode: "copy" | "cut"; path: string } | null;
  /** Bumped per folder (by normalized path) to reload its listing. */
  versions: Record<string, number>;
  /** Bumped to reload every folder. */
  tick: number;
  /** The entry whose Properties dialog is open. */
  properties: string | null;
  /** Waiting for the user to confirm a delete. */
  confirmDelete: { target: Target; unsaved: string[] } | null;
}

const initial: ExplorerState = { expanded: [], selected: null, editing: null, clipboard: null, versions: {}, tick: 0, properties: null, confirmDelete: null };
let state: ExplorerState = initial;
const listeners = new Set<() => void>();

export function explorerState(): ExplorerState {
  return state;
}

export function setExplorer(patch: Partial<ExplorerState> | ((s: ExplorerState) => Partial<ExplorerState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}

export function useExplorer<T>(select: (s: ExplorerState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/** A path as a map key: forward slashes, lowercase on Windows. */
export function folderKey(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-zA-Z]:\//.test(n) || n.startsWith("//") ? n.toLowerCase() : n;
}

export function isExpanded(s: ExplorerState, path: string): boolean {
  return s.expanded.some((p) => samePath(p, path));
}

export function setExpanded(path: string, open: boolean) {
  setExplorer((s) => {
    const rest = s.expanded.filter((p) => !samePath(p, path));
    return { expanded: open ? [...rest, path] : rest };
  });
}

/** Reloads the listings of these folders (all folders when omitted). */
export function reloadFolders(dirs?: string[]) {
  setExplorer((s) => {
    if (!dirs) return { tick: s.tick + 1 };
    const versions = { ...s.versions };
    for (const d of dirs) versions[folderKey(d)] = (versions[folderKey(d)] ?? 0) + 1;
    return { versions };
  });
}

/** Forgets everything when the open folder changes. */
export function resetExplorer() {
  setExplorer({ ...initial, tick: state.tick + 1 });
}
