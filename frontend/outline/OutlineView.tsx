// The Outline: the structure of the active file (frontend/outline/structure.ts),
// updated as you type. Click to go there; the item at the cursor is marked.
// Tests show whether they passed in the last Run of this version of the file,
// and items containing an error found while typing are marked.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { activeDoc, setPrefs, useApp } from "@frontend/app/store";
import { liveProblems, useAnalysisVersion } from "@frontend/analysis/analysis";
import { monaco } from "@frontend/editor/monaco";
import { codePointToUtf16 } from "@frontend/editor/srcloc";
import { Icon, type IconName } from "@frontend/workbench/icons";
import { itemPathAt, outline, type ItemKind, type OutlineItem } from "./structure";

const ICON: Record<ItemKind, IconName> = {
  function: "kindFunction",
  constant: "kindConstant",
  struct: "kindStruct",
  field: "kindField",
  local: "kindLocal",
  test: "tests",
  require: "kindRequire",
  provide: "kindProvide",
  section: "kindSection",
};

// --- the active editor's cursor -------------------------------------------

let cursor: { model: monaco.editor.ITextModel | null; offset: number } = { model: null, offset: -1 };
const cursorListeners = new Set<() => void>();
let tracking = false;

function trackCursors() {
  if (tracking) return;
  tracking = true;
  const watch = (e: monaco.editor.ICodeEditor) => {
    const update = () => {
      const m = e.getModel();
      const p = e.getPosition();
      if (!m || !p || !e.hasWidgetFocus()) return;
      cursor = { model: m, offset: m.getOffsetAt(p) };
      for (const l of cursorListeners) l();
    };
    e.onDidChangeCursorPosition(update);
    e.onDidFocusEditorWidget(update);
  };
  for (const e of monaco.editor.getEditors()) watch(e);
  monaco.editor.onDidCreateEditor(watch);
}

function useCursor() {
  return useSyncExternalStore(
    (l) => {
      cursorListeners.add(l);
      return () => cursorListeners.delete(l);
    },
    () => cursor,
  );
}

/** The outline of a model, recomputed shortly after each edit. */
function useOutline(model: monaco.editor.ITextModel | null): OutlineItem[] {
  const [items, setItems] = useState<OutlineItem[]>(() => (model ? outline(model.getValue()) : []));
  useEffect(() => {
    if (!model) return setItems([]);
    setItems(outline(model.getValue()));
    let timer = 0;
    const sub = model.onDidChangeContent(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => !model.isDisposed() && setItems(outline(model.getValue())), 150);
    });
    return () => {
      window.clearTimeout(timer);
      sub.dispose();
    };
  }, [model]);
  return items;
}

function reveal(model: monaco.editor.ITextModel, item: OutlineItem) {
  const a = model.getPositionAt(item.nameStart);
  const b = model.getPositionAt(item.nameEnd);
  for (const editor of monaco.editor.getEditors()) {
    if (editor.getModel() !== model) continue;
    editor.setSelection(new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column));
    editor.revealLineInCenterIfOutsideViewport(a.lineNumber);
    editor.focus();
    return;
  }
}

function matches(item: OutlineItem, filter: string): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase();
  return item.name.toLowerCase().includes(f) || (item.detail ?? "").toLowerCase().includes(f) || item.children.some((c) => matches(c, filter));
}

export function OutlineView() {
  trackCursors();
  const doc = useApp((s) => activeDoc(s));
  const model = doc?.model ?? null;
  const items = useOutline(model);
  const follow = useApp((s) => s.prefs.outlineFollowCursor);
  const showTests = useApp((s) => s.prefs.outlineShowTests);
  const showSignatures = useApp((s) => s.prefs.outlineShowSignatures);
  const run = useApp((s) => s.run);
  useAnalysisVersion();
  const cur = useCursor();
  const [filter, setFilter] = useState("");
  const [sortByName, setSortByName] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Tests: failed ones from the last Run, if it ran this version of the file.
  const testsKnown = !!doc && run.docId === doc.id && run.tests !== null && run.runVersion === model?.getAlternativeVersionId();
  const failedAt = useMemo(() => {
    if (!testsKnown || !model) return [] as number[];
    const text = model.getValue();
    return (run.tests?.failures ?? []).filter((f) => f && f.position !== null).map((f) => codePointToUtf16(text, (f!.position ?? 1) - 1));
  }, [testsKnown, model, run.tests]);

  // Errors found while typing, by offset.
  const errorOffsets = useMemo(() => {
    if (!model) return [] as number[];
    const text = model.getValue();
    return liveProblems(model)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => codePointToUtf16(text, d.position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, liveProblems(model).diagnostics]);

  const activePath = follow && cur.model === model ? itemPathAt(items, cur.offset) : [];
  const activeItem = activePath[activePath.length - 1];

  useEffect(() => {
    listRef.current?.querySelector(".outline-row.current")?.scrollIntoView({ block: "nearest" });
  }, [activeItem?.start]);

  if (!doc || !model) return <div className="outline"><div className="tree-note">Open a file to see its outline.</div></div>;

  const keyOf = (it: OutlineItem) => `${it.kind}:${it.name}:${it.start}`;
  const visible = items
    .filter((it) => showTests || it.kind !== "test")
    .filter((it) => matches(it, filter));
  const ordered = sortByName ? [...visible].sort((a, b) => a.name.localeCompare(b.name)) : visible;

  const row = (it: OutlineItem, depth: number) => {
    const key = keyOf(it);
    const open = !collapsed.has(key) || !!filter;
    const kids = it.children.filter((c) => matches(c, filter));
    const isCurrent = activeItem === it;
    const failed = it.kind === "test" && testsKnown && failedAt.some((o) => o >= it.start && o <= it.end);
    const passed = it.kind === "test" && testsKnown && !failed;
    const hasError = errorOffsets.some((o) => o >= it.start && o <= it.end);
    const detail = it.kind === "function" && !showSignatures && it.detail?.includes("->") ? undefined : it.detail;
    return (
      <li key={key}>
        <div
          className={`outline-row kind-${it.kind}${isCurrent ? " current" : ""}${activePath.includes(it) && !isCurrent ? " on-path" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          title={`${it.name}${it.detail ? `  ${it.detail}` : ""}`}
          onClick={() => reveal(model, it)}
        >
          <span
            className={`twisty${kids.length ? (open ? " open" : "") : " none"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!kids.length) return;
              setCollapsed((s) => {
                const n = new Set(s);
                if (n.has(key)) n.delete(key);
                else n.add(key);
                return n;
              });
            }}
          />
          <Icon name={ICON[it.kind]} size={14} className="outline-icon" />
          <span className="outline-name">{it.name}</span>
          {detail && <span className="outline-detail">{detail}</span>}
          {failed && <span className="outline-badge fail" title="This test failed in the last Run">✗</span>}
          {passed && <span className="outline-badge pass" title="This test passed in the last Run">✓</span>}
          {hasError && !failed && <span className="outline-badge error" title="An error found while typing" />}
        </div>
        {kids.length > 0 && open && <ul>{kids.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="outline">
      <div className="explorer-head">
        <span className="explorer-title" title={doc.path ?? doc.name}>
          Outline · {doc.name}
        </span>
        <button
          className={`icon-button${sortByName ? " on" : ""}`}
          title={sortByName ? "Sort by position" : "Sort by name"}
          aria-label="Sort by name"
          aria-pressed={sortByName}
          onClick={() => setSortByName((v) => !v)}
        >
          <Icon name="sort" size={14} />
        </button>
        <button
          className={`icon-button${showTests ? " on" : ""}`}
          title={showTests ? "Hide tests" : "Show tests"}
          aria-label="Show tests"
          aria-pressed={showTests}
          onClick={() => setPrefs({ outlineShowTests: !showTests })}
        >
          <Icon name="tests" size={14} />
        </button>
        <button
          className={`icon-button${follow ? " on" : ""}`}
          title={follow ? "Stop following the cursor" : "Follow the cursor"}
          aria-label="Follow the cursor"
          aria-pressed={follow}
          onClick={() => setPrefs({ outlineFollowCursor: !follow })}
        >
          <Icon name="dot" size={14} />
        </button>
        <button className="icon-button" title="Collapse All" aria-label="Collapse All" onClick={() => setCollapsed(new Set(items.filter((i) => i.children.length).map(keyOf)))}>
          <Icon name="collapse" size={14} />
        </button>
      </div>
      <div className="outline-filter">
        <input aria-label="Filter the outline" placeholder="Filter" value={filter} spellCheck={false} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setFilter("")} />
      </div>
      <div className="outline-body" ref={listRef}>
        {ordered.length === 0 ? (
          <div className="tree-note">{filter ? "Nothing matches." : "No definitions yet."}</div>
        ) : (
          <ul className="outline-tree" role="tree" aria-label="Outline">
            {ordered.map((it) => row(it, 0))}
          </ul>
        )}
      </div>
    </div>
  );
}
