import { useEffect, useRef, useState } from "react";
import { PROFILES, versionMismatch } from "@shared/models/profiles";
import { activeDoc, activeProfile, headerChanged, setDialog, setPrefs, useApp } from "@frontend/app/store";
import { definitionsEditor } from "@frontend/editor/EditorArea";
import { monaco } from "@frontend/editor/monaco";
import { useUpdate } from "@frontend/app/updates";

function useCursor() {
  const [pos, setPos] = useState<{ line: number; col: number } | null>(null);
  const activeId = useApp((s) => s.activeId);
  useEffect(() => {
    const ed = definitionsEditor();
    if (!ed) return;
    const update = () => {
      const p = ed.getPosition();
      setPos(p ? { line: p.lineNumber, col: p.column } : null);
    };
    update();
    const d = ed.onDidChangeCursorPosition(update);
    return () => d.dispose();
  }, [activeId]);
  return pos;
}

const EOL_LABEL = { lf: "LF", crlf: "CRLF", mixed: "Mixed EOL", none: "LF" } as const;

function ProfileMenu() {
  const profile = useApp((s) => activeProfile(s));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="status-menu" ref={ref}>
      <button className="status-item strong" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {profile.short}
      </button>
      {open && (
        <ul className="menu" role="menu">
          {PROFILES.map((p) => (
            <li key={p.id}>
              <button
                role="menuitemradio"
                aria-checked={p.id === profile.id}
                className={p.id === profile.id ? "selected" : ""}
                onClick={() => {
                  setPrefs({ profile: p.id });
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function restoreHeader() {
  const doc = activeDoc();
  if (!doc?.originalHeader) return;
  const n = doc.language.metadataLines;
  doc.model.pushEditOperations(
    [],
    [{ range: new monaco.Range(1, 1, n, doc.model.getLineMaxColumn(n)), text: doc.originalHeader }],
    () => null,
  );
}

export function StatusBar() {
  const doc = useApp((s) => activeDoc(s));
  const runtime = useApp((s) => s.runtime);
  const profile = useApp((s) => activeProfile(s));
  const metadataEdited = useApp((s) => {
    const d = activeDoc(s);
    return !!d && headerChanged(d);
  });
  useApp((s) => s.revision);
  const cursor = useCursor();
  const update = useUpdate();

  const rt = runtime.runtime;
  const mismatch = versionMismatch(profile, rt?.version);
  const runtimeLabel =
    runtime.state === "ready" && rt
      ? `Racket ${rt.version}`
      : runtime.state === "detecting"
        ? "Racket…"
        : runtime.state === "missing"
          ? "Racket not found"
          : "Racket error";

  return (
    <footer className="status-bar" aria-label="Status bar">
      <ProfileMenu />
      {doc && (
        <span className={`status-item${doc.language.kind === "unrecognized-metadata" ? " status-warn" : ""}`}>
          {doc.language.kind === "unrecognized-metadata" ? "Unrecognized language" : doc.language.name}
        </span>
      )}
      <button
        className={`status-item${runtime.state === "ready" && !mismatch && !runtime.message ? "" : " status-warn"}`}
        title={[rt?.executable, mismatch, runtime.message].filter(Boolean).join("\n")}
        onClick={() => setDialog("runtime")}
      >
        {runtimeLabel}
      </button>
      {metadataEdited && (
        <button className="status-item status-warn" title="Restore lines 1 to 3" onClick={restoreHeader}>
          Metadata edited
        </button>
      )}
      <span className="status-spacer" />
      {(update.status === "available" || update.status === "downloading") && (
        <button className="status-item strong" onClick={() => setDialog("update")}>
          Update {update.version}
        </button>
      )}
      {doc && <span className="status-item">UTF-8{doc.hasBom ? " BOM" : ""}</span>}
      {doc && <span className="status-item">{EOL_LABEL[doc.lineEnding]}</span>}
      {doc && cursor && (
        <span className="status-item">
          Ln {cursor.line}, Col {cursor.col}
        </span>
      )}
    </footer>
  );
}
