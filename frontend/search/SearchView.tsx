// Find in Files: searches the text files of the open folder (read-only) and
// opens a result at its line.

import { useEffect, useRef, useState } from "react";
import type { SearchMatch } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { getState, openPath, useApp } from "@frontend/app/store";
import { activeGroupEditor } from "@frontend/workbench/editors";

function rel(path: string, root: string) {
  const p = path.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : p;
}

async function openMatch(m: SearchMatch, length: number) {
  await openPath(m.path);
  requestAnimationFrame(() => {
    const editor = activeGroupEditor();
    if (!editor) return;
    const range = { startLineNumber: m.line, startColumn: m.column, endLineNumber: m.line, endColumn: m.column + length };
    editor.setSelection(range);
    editor.revealRangeInCenterIfOutsideViewport(range);
    editor.focus();
  });
}

export function SearchView() {
  const folder = useApp((s) => s.folder);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const root = getState().folder;
    if (!root || query.length < 2) {
      setResults(null);
      return;
    }
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      backend
        .workspaceSearch(root, query, caseSensitive)
        .then((r) => n === seq.current && (setResults(r), setError(null)))
        .catch((e) => n === seq.current && setError(String(e)));
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, caseSensitive, folder]);

  const byFile = new Map<string, SearchMatch[]>();
  for (const m of results ?? []) byFile.set(m.path, [...(byFile.get(m.path) ?? []), m]);

  return (
    <div className="search-view">
      <div className="sidebar-title">Search</div>
      <div className="search-inputs">
        <input ref={input} value={query} placeholder="Search" aria-label="Search in files" onChange={(e) => setQuery(e.target.value)} />
        <label className="check small" title="Match Case">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Aa
        </label>
      </div>
      <div className="search-results">
        {!folder && <p className="tree-note">Open a folder to search its files.</p>}
        {error && <p className="tree-note status-warn">{error}</p>}
        {results && (
          <p className="tree-note">
            {results.length === 0 ? "No results." : `${results.length}${results.length >= 2000 ? "+" : ""} results in ${byFile.size} files`}
          </p>
        )}
        {[...byFile].map(([path, matches]) => (
          <div key={path} className="search-file">
            <div className="search-file-name" title={path}>
              {folder ? rel(path, folder) : path}
              <span className="badge">{matches.length}</span>
            </div>
            <ul>
              {matches.map((m) => (
                <li key={`${m.line}:${m.column}`}>
                  <button className="search-hit" onClick={() => void openMatch(m, query.length)}>
                    <span className="muted">{m.line}</span> {m.text.trim()}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
