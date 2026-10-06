// The Explorer: the open folder as a tree, with file operations (context
// menu, keys, drag and drop), hiding rules from Settings > Files, and live
// updates from the folder watcher.

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { FileEntry } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { activeDoc, openFolderWithDialog, setFolder, setPrefs, useApp } from "@frontend/app/store";
import { openContextMenu } from "@frontend/workbench/ContextMenu";
import { definitionsEditor } from "@frontend/editor/EditorArea";
import { Icon } from "@frontend/workbench/icons";
import * as A from "./actions";
import { EXPLORER_MENU, setMenuTarget } from "./commands";
import { hiddenMatcher, type HiddenMatcher } from "./hidden";
import { baseName, formatSize, isWithin, relativeTo, samePath } from "./paths";
import { PropertiesDialog } from "./PropertiesDialog";
import { fileStatus, folderChanged, useGit } from "@frontend/git/git";
import { Modal } from "@frontend/app/Modal";
import { explorerState, folderKey, isExpanded, reloadFolders, resetExplorer, setExpanded, setExplorer, useExplorer, type Target } from "./state";

const SOURCE = /\.(rkt|rktl|scm|ss)$/i;

/** Explorer colors for files changed since the last commit (frontend/git). */
function gitClass(e: FileEntry): string {
  if (e.isDir) return folderChanged(e.path) ? "git-folder" : "";
  const s = fileStatus(e.path);
  return s ? `git-${s === "?" ? "untracked" : s}` : "";
}
const DRAG_TYPE = "application/x-phdracket-path";

export function formatTime(ms: number | null): string {
  return ms === null ? "unknown" : new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function tooltip(e: FileEntry): string {
  return e.isDir ? e.path : `${e.path}\n${formatSize(e.size)} · Modified ${formatTime(e.modified)}`;
}

/** The inline name box for a new entry or a rename. */
function NameInput({ initial, depth, isDir }: { initial: string; depth: number; isDir: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select the name without its extension, like a file manager.
    const dot = isDir ? -1 : initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, isDir]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) void A.commitEdit(ref.current?.value ?? "");
    else A.cancelEdit();
  };
  return (
    <div className="tree-row editing" style={{ paddingLeft: 8 + depth * 14 }}>
      <span className={`twisty${isDir ? "" : " none"}`} aria-hidden />
      <input
        ref={ref}
        className="tree-input"
        aria-label={isDir ? "Folder name" : "File name"}
        defaultValue={initial}
        spellCheck={false}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        onBlur={() => finish(true)}
      />
    </div>
  );
}

function canDrop(e: DragEvent) {
  return e.dataTransfer.types.includes(DRAG_TYPE);
}

/** One folder level; children load when the folder is expanded and reload
 * when the watcher reports a change in it. */
function FolderContents({ root, path, depth, hide }: { root: string; path: string; depth: number; hide: HiddenMatcher | null }) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useExplorer((s) => `${s.tick}:${s.versions[folderKey(path)] ?? 0}`);
  const expanded = useExplorer((s) => s.expanded);
  const selected = useExplorer((s) => s.selected);
  const editing = useExplorer((s) => s.editing);
  const cut = useExplorer((s) => (s.clipboard?.mode === "cut" ? s.clipboard.path : null));
  const [dropOn, setDropOn] = useState<string | null>(null);
  const active = useApp((s) => activeDoc(s)?.path ?? null);
  const gitColors = useApp((s) => s.prefs.gitExplorer && s.prefs.git);
  useGit((s) => s.status);

  useEffect(() => {
    let live = true;
    backend
      .fsList(root, path)
      .then((e) => live && (setEntries(e), setError(null)))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [root, path, version]);

  if (error) return <div className="tree-note" style={{ paddingLeft: 12 + depth * 14 }}>{error}</div>;
  if (!entries) return null;
  const shown = hide ? entries.filter((e) => !hide(relativeTo(e.path, root), e.isDir)) : entries;
  const creating = editing && editing.kind !== "rename" && samePath(editing.dir, path) ? editing : null;
  if (shown.length === 0 && depth === 0 && !creating) return <div className="tree-note">Empty folder</div>;

  const row = (e: FileEntry) => {
    const t: Target = { path: e.path, isDir: e.isDir };
    const open = e.isDir && expanded.some((p) => samePath(p, e.path));
    if (editing?.kind === "rename" && samePath(editing.path, e.path)) {
      return (
        <li key={e.path}>
          <NameInput initial={e.name} depth={depth} isDir={e.isDir} />
        </li>
      );
    }
    const classes = [
      "tree-row",
      e.isDir ? "dir" : SOURCE.test(e.name) ? "source" : "other",
      samePath(active, e.path) ? "active" : "",
      samePath(selected?.path, e.path) ? "selected" : "",
      cut && samePath(cut, e.path) ? "cut" : "",
      dropOn && samePath(dropOn, e.path) ? "drop" : "",
      gitColors ? gitClass(e) : "",
    ].filter(Boolean);
    return (
      <li key={e.path} role="treeitem" aria-expanded={e.isDir ? open : undefined} aria-selected={samePath(selected?.path, e.path)}>
        <button
          className={classes.join(" ")}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={tooltip(e)}
          data-path={e.path}
          data-dir={e.isDir ? "1" : undefined}
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData(DRAG_TYPE, e.path);
            ev.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(ev) => {
            if (!e.isDir || !canDrop(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            setDropOn(e.path);
          }}
          onDragLeave={() => setDropOn(null)}
          onDrop={(ev) => {
            if (!e.isDir || !canDrop(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            setDropOn(null);
            const src = ev.dataTransfer.getData(DRAG_TYPE);
            if (src && !isWithin(e.path, src)) void A.moveTo(src, e.path);
          }}
          onClick={(ev) => {
            const button = ev.currentTarget;
            A.select(t);
            // A click opens the file but keeps the keyboard in the tree (for
            // F2, Delete, Ctrl+C…); a double click moves to the editor.
            button.focus();
            void A.open(t, true);
          }}
          onDoubleClick={() => !e.isDir && requestAnimationFrame(() => definitionsEditor()?.focus())}
          onContextMenu={(ev) => {
            ev.stopPropagation();
            A.select(t);
            setMenuTarget(t);
            openContextMenu(ev, EXPLORER_MENU, t);
          }}
        >
          <span className={`twisty${e.isDir ? (open ? " open" : "") : " none"}`} aria-hidden />
          <span className="tree-name">{e.name}</span>
          {gitColors && !e.isDir && fileStatus(e.path) && <span className="tree-git">{fileStatus(e.path) === "?" ? "U" : fileStatus(e.path)}</span>}
        </button>
        {e.isDir && (open || (editing && editing.kind !== "rename" && samePath(editing.dir, e.path))) && (
          <FolderContents root={root} path={e.path} depth={depth + 1} hide={hide} />
        )}
      </li>
    );
  };

  // New entries are typed above the folder's other entries.
  return (
    <ul className="tree" role={depth === 0 ? "tree" : "group"}>
      {creating && (
        <li>
          <NameInput initial={creating.kind === "new-file" ? "untitled.rkt" : "New Folder"} depth={depth} isDir={creating.kind === "new-folder"} />
        </li>
      )}
      {shown.map(row)}
    </ul>
  );
}

/** Keys while the tree has focus. */
function onTreeKey(e: KeyboardEvent<HTMLDivElement>) {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const mod = e.ctrlKey || e.metaKey;
  const sel = explorerState().selected;
  const handled = () => {
    e.preventDefault();
    e.stopPropagation();
  };
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button.tree-row[data-path]")];
  const index = sel ? rows.findIndex((r) => samePath(r.dataset.path, sel.path)) : -1;
  const pick = (i: number) => {
    const r = rows[Math.min(Math.max(i, 0), rows.length - 1)];
    if (!r) return;
    A.select({ path: r.dataset.path!, isDir: r.dataset.dir === "1" });
    r.focus();
  };
  if (e.key === "ArrowDown") return handled(), pick(index + 1);
  if (e.key === "ArrowUp") return handled(), pick(index < 0 ? 0 : index - 1);
  if (!sel) return;
  if (e.key === "ArrowRight" && sel.isDir) return handled(), setExpanded(sel.path, true);
  if (e.key === "ArrowLeft" && sel.isDir) return handled(), setExpanded(sel.path, false);
  if (e.key === "Enter") return handled(), void A.open(sel);
  if (e.key === "F2") return handled(), A.startRename(sel);
  if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) return handled(), A.remove(sel);
  if (mod && e.key.toLowerCase() === "c") return handled(), A.copy(sel, "copy");
  if (mod && e.key.toLowerCase() === "x") return handled(), A.copy(sel, "cut");
  if (mod && e.key.toLowerCase() === "v") return handled(), void A.paste(sel);
  if (mod && e.key.toLowerCase() === "d") return handled(), void A.duplicate(sel);
}

function SelectionInfo({ root }: { root: string }) {
  const sel = useExplorer((s) => s.selected);
  const tick = useExplorer((s) => (sel ? `${s.tick}:${s.versions[folderKey(sel.path.replace(/[\\/][^\\/]+$/, ""))] ?? 0}` : ""));
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!sel || sel.isDir) return setInfo(null);
    backend
      .fsProperties(root, sel.path)
      .then((p) => live && setInfo(`${formatSize(p.size)} · ${p.lines ?? "?"} lines · ${formatTime(p.modified)}`))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [root, sel, tick]);
  if (!sel || sel.isDir || !info) return null;
  return (
    <div className="explorer-foot" title={sel.path}>
      <span className="explorer-foot-name">{baseName(sel.path)}</span>
      <span>{info}</span>
    </div>
  );
}

function ConfirmDelete() {
  const c = useExplorer((s) => s.confirmDelete);
  if (!c) return null;
  const name = baseName(c.target.path);
  const close = () => setExplorer({ confirmDelete: null });
  return (
    <Modal title="Delete" onClose={close} className="confirm-delete">
      <p>
        Move {c.target.isDir ? <>the folder <strong>{name}</strong> and everything in it</> : <strong>{name}</strong>} to the Recycle Bin?
      </p>
      {c.unsaved.length > 0 && <p className="status-warn">Unsaved changes in {c.unsaved.join(", ")} will be lost.</p>}
      <p className="muted small">You can restore it from the Recycle Bin.</p>
      <div className="row end">
        <button onClick={close}>Cancel</button>
        <button className="primary" autoFocus onClick={() => void A.confirmRemove()}>
          Move to Recycle Bin
        </button>
      </div>
    </Modal>
  );
}

export function Explorer() {
  const folder = useApp((s) => s.folder);
  const patterns = useApp((s) => s.prefs.hiddenFiles);
  const showHidden = useApp((s) => s.prefs.showHiddenFiles);
  const properties = useExplorer((s) => s.properties);
  const [rootDrop, setRootDrop] = useState(false);
  const hide = useMemo(() => (showHidden ? null : hiddenMatcher(patterns)), [patterns, showHidden]);

  // A different folder: start fresh. Watcher events reload the folders that changed.
  useEffect(() => {
    resetExplorer();
  }, [folder]);
  useEffect(() => {
    const off = backend.onFolderChanged((dirs) => reloadFolders(dirs));
    return () => void off.then((f) => f());
  }, []);

  const rootTarget: Target | null = folder ? { path: folder, isDir: true } : null;
  const onEmptyContext = (e: MouseEvent) => {
    if (!rootTarget) return;
    A.select(null);
    setMenuTarget(null);
    openContextMenu(e, EXPLORER_MENU, rootTarget);
  };

  return (
    <div className="explorer">
      <div className="explorer-head">
        <span className="explorer-title" title={folder ?? undefined}>
          {folder ? baseName(folder) : "Explorer"}
        </span>
        {folder && (
          <>
            <button className="icon-button" title="New File" aria-label="New File" onClick={() => A.startNew("new-file")}>
              <Icon name="newFile" size={14} />
            </button>
            <button className="icon-button" title="New Folder" aria-label="New Folder" onClick={() => A.startNew("new-folder")}>
              <Icon name="newFolder" size={14} />
            </button>
            <button
              className={`icon-button${showHidden ? " on" : ""}`}
              title={showHidden ? "Hide files hidden in Settings > Files" : "Show hidden files"}
              aria-label="Show hidden files"
              aria-pressed={showHidden}
              onClick={() => setPrefs({ showHiddenFiles: !showHidden })}
            >
              <Icon name={showHidden ? "eye" : "eyeOff"} size={14} />
            </button>
            <button className="icon-button" title="Refresh" aria-label="Refresh" onClick={() => reloadFolders()}>
              <Icon name="restart" size={14} />
            </button>
            <button className="icon-button" title="Collapse Folders" aria-label="Collapse Folders" onClick={() => A.collapseAll()}>
              <Icon name="collapse" size={14} />
            </button>
            <button className="icon-button" title="Close Folder" aria-label="Close Folder" onClick={() => setFolder(null)}>
              <Icon name="close" size={14} />
            </button>
          </>
        )}
      </div>
      <div
        className={`explorer-body${rootDrop ? " drop" : ""}`}
        tabIndex={-1}
        onKeyDown={onTreeKey}
        onContextMenu={onEmptyContext}
        onDragOver={(e) => {
          if (!folder || !canDrop(e)) return;
          e.preventDefault();
          setRootDrop(true);
        }}
        onDragLeave={() => setRootDrop(false)}
        onDrop={(e) => {
          setRootDrop(false);
          if (!folder || !canDrop(e)) return;
          e.preventDefault();
          const src = e.dataTransfer.getData(DRAG_TYPE);
          if (src) void A.moveTo(src, folder);
        }}
      >
        {folder ? (
          <FolderContents root={folder} path={folder} depth={0} hide={hide} />
        ) : (
          <div className="tree-note">
            <p>No folder open.</p>
            <button onClick={() => void openFolderWithDialog()}>Open Folder…</button>
          </div>
        )}
      </div>
      {folder && <SelectionInfo root={folder} />}
      {folder && properties && <PropertiesDialog root={folder} path={properties} />}
      <ConfirmDelete />
    </div>
  );
}

export { isExpanded };
