// What the Explorer does: every file operation goes through the backend's
// fs_* commands (backend/src/files.rs), which refuse paths outside the open
// folder, never overwrite, and delete only to the Recycle Bin.

import { backend } from "@frontend/ipc/backend";
import { followMove, forgetDeleted, getState, isDirty, notify, openPath } from "@frontend/app/store";
import { baseName, isWithin, parentOf, relativeTo, samePath } from "./paths";
import { explorerState, reloadFolders, setExpanded, setExplorer, type Target } from "./state";

function root(): string | null {
  return getState().folder;
}

function fail(what: string, e: unknown) {
  notify("error", `${what}: ${String(e).replace(/^Error:\s*/, "")}`);
}

/** The folder a new entry or a paste goes into for this target. */
export function folderFor(t: Target | null | undefined): string | null {
  if (!t) return root();
  return t.isDir ? t.path : parentOf(t.path);
}

export function select(t: Target | null) {
  setExplorer({ selected: t });
}

export function startNew(kind: "new-file" | "new-folder", target?: Target | null) {
  const dir = folderFor(target ?? explorerState().selected);
  if (!dir) return;
  if (root() && !samePath(dir, root())) setExpanded(dir, true);
  setExplorer({ editing: { kind, dir } });
}

export function startRename(t: Target | null = explorerState().selected) {
  if (!t || samePath(t.path, root())) return;
  setExplorer({ editing: { kind: "rename", dir: parentOf(t.path), path: t.path } });
}

export function cancelEdit() {
  setExplorer({ editing: null });
}

/** Finishes the inline name box. An empty or unchanged name cancels. */
export async function commitEdit(name: string) {
  const ed = explorerState().editing;
  const r = root();
  setExplorer({ editing: null });
  if (!ed || !r) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    if (ed.kind === "rename" && ed.path) {
      if (trimmed === baseName(ed.path)) return;
      const to = await backend.fsRename(r, ed.path, trimmed);
      followMove(ed.path, to);
      select({ path: to, isDir: explorerState().selected?.isDir ?? false });
    } else if (ed.kind === "new-file") {
      const created = await backend.fsCreateFile(r, ed.dir, trimmed);
      select({ path: created, isDir: false });
      reloadFolders([ed.dir]);
      await openPath(created);
    } else {
      const created = await backend.fsCreateDir(r, ed.dir, trimmed);
      select({ path: created, isDir: true });
    }
    reloadFolders([ed.dir]);
  } catch (e) {
    fail(ed.kind === "rename" ? "Cannot rename" : "Cannot create", e);
  }
}

export async function duplicate(t: Target | null = explorerState().selected) {
  const r = root();
  if (!t || !r) return;
  try {
    const copy = await backend.fsDuplicate(r, t.path);
    select({ path: copy, isDir: t.isDir });
    reloadFolders([parentOf(t.path)]);
  } catch (e) {
    fail("Cannot duplicate", e);
  }
}

export function copy(t: Target | null = explorerState().selected, mode: "copy" | "cut" = "copy") {
  if (!t || samePath(t.path, root())) return;
  setExplorer({ clipboard: { mode, path: t.path } });
}

export async function paste(target: Target | null = explorerState().selected) {
  const clip = explorerState().clipboard;
  const r = root();
  const dest = folderFor(target);
  if (!clip || !r || !dest) return;
  try {
    if (clip.mode === "cut") {
      await moveTo(clip.path, dest);
      setExplorer({ clipboard: null });
    } else {
      const made = await backend.fsCopy(r, clip.path, dest);
      select({ path: made, isDir: explorerState().selected?.isDir ?? false });
      reloadFolders([dest]);
    }
  } catch (e) {
    fail("Cannot paste", e);
  }
}

/** Moves an entry into a folder (drag and drop, or cut and paste). */
export async function moveTo(src: string, destDir: string) {
  const r = root();
  if (!r || samePath(parentOf(src), destDir)) return;
  try {
    const to = await backend.fsMove(r, src, destDir);
    followMove(src, to);
    setExpanded(destDir, true);
    reloadFolders([parentOf(src), destDir]);
  } catch (e) {
    fail("Cannot move", e);
  }
}

/** Asks before moving to the Recycle Bin (the dialog warns about unsaved changes). */
export function remove(t: Target | null = explorerState().selected) {
  const r = root();
  if (!t || !r || samePath(t.path, r)) return;
  const unsaved = getState()
    .docs.filter((d) => d.path && isWithin(d.path, t.path) && isDirty(d))
    .map((d) => d.name);
  setExplorer({ confirmDelete: { target: t, unsaved } });
}

/** Moves the entry the user confirmed to the Recycle Bin. */
export async function confirmRemove() {
  const c = explorerState().confirmDelete;
  const r = root();
  setExplorer({ confirmDelete: null });
  if (!c || !r) return;
  const t = c.target;
  try {
    await backend.fsTrash(r, t.path);
    forgetDeleted(t.path);
    if (explorerState().selected && isWithin(explorerState().selected!.path, t.path)) select(null);
    reloadFolders([parentOf(t.path)]);
  } catch (e) {
    fail("Cannot delete", e);
  }
}

export function copyPath(t: Target | null = explorerState().selected, relative = false) {
  const r = root();
  if (!t || !r) return;
  void navigator.clipboard.writeText(relative ? relativeTo(t.path, r) || "." : t.path);
}

export function reveal(t: Target | null = explorerState().selected) {
  const r = root();
  if (!t || !r) return;
  backend.fsReveal(r, t.path).catch((e) => fail("Cannot show the file", e));
}

export function showProperties(t: Target | null = explorerState().selected) {
  const path = t?.path ?? root();
  if (path) setExplorer({ properties: path });
}

/** Opens a file (or toggles a folder). `preserveFocus` keeps the keyboard in the tree. */
export async function open(t: Target | null = explorerState().selected, preserveFocus = false) {
  if (!t) return;
  if (t.isDir) setExpanded(t.path, !explorerState().expanded.some((p) => samePath(p, t.path)));
  else await openPath(t.path, { preserveFocus });
}

export function collapseAll() {
  setExplorer({ expanded: [] });
}
