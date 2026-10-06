// A diff tab: Monaco's diff editor with an older version on the left and,
// for changes in the working copy, the file itself (live, editable) on the
// right.

import { useEffect, useRef, useState } from "react";
import { getState, openPath, useApp } from "@frontend/app/store";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID } from "@frontend/editor/racket-language";
import { samePath } from "@frontend/explorer/paths";
import { Icon } from "@frontend/workbench/icons";

export function DiffView({ id }: { id: string }) {
  const tab = useApp((s) => s.diffTabs.find((t) => t.id === id) ?? null);
  const prefs = useApp((s) => s.prefs);
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [inline, setInline] = useState(false);
  const [changes, setChanges] = useState(0);
  const docCount = useApp((s) => s.docs.length);

  useEffect(() => {
    if (!tab || !host.current) return;
    const lang = /\.(rkt|rktl|scm|ss)/i.test(tab.right.path ?? tab.title) ? RACKET_LANGUAGE_ID : "plaintext";
    const owned: monaco.editor.ITextModel[] = [];
    const original = monaco.editor.createModel(tab.left.text, lang);
    owned.push(original);
    // The working copy: the open document if there is one, else the file's text.
    let modified: monaco.editor.ITextModel;
    const doc = tab.right.path ? getState().docs.find((d) => samePath(d.path, tab.right.path)) : undefined;
    if (doc) modified = doc.model;
    else {
      modified = monaco.editor.createModel(tab.right.text ?? "", lang);
      owned.push(modified);
    }
    const editor = monaco.editor.createDiffEditor(host.current, {
      automaticLayout: true,
      readOnly: !doc,
      originalEditable: false,
      renderSideBySide: !inline,
      renderOverviewRuler: true,
      ignoreTrimWhitespace: false,
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
    });
    editor.setModel({ original, modified });
    editorRef.current = editor;
    const sub = editor.onDidUpdateDiff(() => setChanges(editor.getLineChanges()?.length ?? 0));
    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
      for (const m of owned) m.dispose();
    };
    // Recreate when the document opens or the versions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.left.text, tab?.right.text, tab?.right.path, docCount]);

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: !inline });
  }, [inline]);

  if (!tab) return null;
  const go = (dir: 1 | -1) => {
    const ed = editorRef.current;
    const list = ed?.getLineChanges() ?? [];
    if (!ed || list.length === 0) return;
    const m = ed.getModifiedEditor();
    const line = m.getPosition()?.lineNumber ?? 0;
    const starts = list.map((c) => Math.max(c.modifiedStartLineNumber, 1));
    const next = dir > 0 ? (starts.find((s) => s > line) ?? starts[0]) : ([...starts].reverse().find((s) => s < line) ?? starts[starts.length - 1]);
    m.setPosition({ lineNumber: next, column: 1 });
    m.revealLineInCenter(next);
    m.focus();
  };

  return (
    <div className="diff-view">
      <div className="diff-bar">
        <span className="diff-side">{tab.left.label}</span>
        <Icon name="diff" size={14} />
        <span className="diff-side">{tab.right.label}</span>
        <span className="muted small">{changes === 0 ? "No differences" : `${changes} change${changes === 1 ? "" : "s"}`}</span>
        <span className="toolbar-spacer" />
        <button className="icon-button" title="Previous change" aria-label="Previous change" onClick={() => go(-1)}>
          <Icon name="back" size={14} />
        </button>
        <button className="icon-button" title="Next change" aria-label="Next change" onClick={() => go(1)}>
          <Icon name="forward" size={14} />
        </button>
        <button className={`icon-button labeled${inline ? " on" : ""}`} onClick={() => setInline((v) => !v)} title="Show the two versions side by side or in one column">
          <span>{inline ? "Side by side" : "Inline"}</span>
        </button>
        {tab.right.path && (
          <button className="icon-button labeled" onClick={() => void openPath(tab.right.path!)} title="Open the file">
            <Icon name="openFile" size={14} />
            <span>Open File</span>
          </button>
        )}
      </div>
      <div className="diff-host monaco-component" ref={host} />
    </div>
  );
}
