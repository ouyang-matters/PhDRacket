import { useCallback, useEffect, useState } from "react";
import type { DirEntry } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { activeDoc, openFolderWithDialog, openPath, setFolder, useApp } from "@frontend/app/store";

const SOURCE = /\.(rkt|rktl|scm|ss)$/i;

function samePath(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const n = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return n(a) === n(b);
}

function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
}

/** One folder level; children load when the folder is expanded. */
function FolderContents({ path, depth, version }: { path: string; depth: number; version: number }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const active = useApp((s) => activeDoc(s)?.path ?? null);

  useEffect(() => {
    let live = true;
    backend
      .listFolder(path)
      .then((e) => live && (setEntries(e), setError(null)))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [path, version]);

  const toggle = useCallback((p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  if (error) return <div className="tree-note" style={{ paddingLeft: 12 + depth * 14 }}>{error}</div>;
  if (!entries) return null;
  if (entries.length === 0 && depth === 0) return <div className="tree-note">Empty folder</div>;

  return (
    <ul className="tree" role={depth === 0 ? "tree" : "group"}>
      {entries.map((e) => {
        const open = expanded.has(e.path);
        return (
          <li key={e.path} role="treeitem" aria-expanded={e.isDir ? open : undefined}>
            <button
              className={`tree-row${e.isDir ? " dir" : SOURCE.test(e.name) ? " source" : " other"}${samePath(active, e.path) ? " active" : ""}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              title={e.path}
              onClick={() => (e.isDir ? toggle(e.path) : void openPath(e.path))}
            >
              <span className={`twisty${e.isDir ? (open ? " open" : "") : " none"}`} aria-hidden />
              {e.name}
            </button>
            {e.isDir && open && <FolderContents path={e.path} depth={depth + 1} version={version} />}
          </li>
        );
      })}
    </ul>
  );
}

export function Explorer() {
  const folder = useApp((s) => s.folder);
  const width = useApp((s) => s.prefs.explorerWidth);
  const [version, setVersion] = useState(0);

  return (
    <aside className="explorer" style={{ width }} aria-label="Explorer">
      <div className="explorer-head">
        <span className="explorer-title" title={folder ?? undefined}>
          {folder ? baseName(folder) : "Explorer"}
        </span>
        {folder && (
          <>
            <button className="small-btn" title="Refresh" onClick={() => setVersion((v) => v + 1)}>
              Refresh
            </button>
            <button className="small-btn" title="Close folder" onClick={() => setFolder(null)}>
              Close
            </button>
          </>
        )}
      </div>
      <div className="explorer-body">
        {folder ? (
          <FolderContents path={folder} depth={0} version={version} />
        ) : (
          <div className="tree-note">
            <p>No folder open.</p>
            <button onClick={() => void openFolderWithDialog()}>Open Folder…</button>
          </div>
        )}
      </div>
    </aside>
  );
}
