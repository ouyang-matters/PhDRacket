// The status bar: concise operational state. Every item that can be changed
// opens the same picker or dialog as its command.

import { useGit } from "@frontend/git/git";
import { useEffect, useState } from "react";
import { versionMismatch } from "@shared/models/profiles";
import { activeDoc, activeProfile, headerChanged, setDialog, useApp } from "@frontend/app/store";
import { monaco } from "@frontend/editor/monaco";
import { useUpdate } from "@frontend/app/updates";
import { executeCommand } from "@frontend/commands/registry";
import { activeGroupEditor } from "@frontend/workbench/editors";
import { Icon } from "@frontend/workbench/icons";
import { ComputeStatus } from "@frontend/compute/ComputeStatus";

function useCursor() {
  const [pos, setPos] = useState<{ line: number; col: number; selected: number } | null>(null);
  const activeId = useApp((s) => s.activeId);
  const group = useApp((s) => s.layout.activeGroup);
  useEffect(() => {
    // The group's editor mounts in the same frame; read it after layout.
    let disposable: { dispose(): void } | null = null;
    const frame = requestAnimationFrame(() => {
      const ed = activeGroupEditor();
      if (!ed) return setPos(null);
      const update = () => {
        const p = ed.getPosition();
        const sel = ed.getSelection();
        const selected = sel && ed.getModel() ? ed.getModel()!.getValueInRange(sel).length : 0;
        setPos(p ? { line: p.lineNumber, col: p.column, selected } : null);
      };
      update();
      disposable = ed.onDidChangeCursorSelection(update);
    });
    return () => {
      cancelAnimationFrame(frame);
      disposable?.dispose();
    };
  }, [activeId, group]);
  return pos;
}

const EOL_LABEL = { lf: "LF", crlf: "CRLF", mixed: "Mixed EOL", none: "LF" } as const;

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
  const git = useGit((s) => s.status);

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
  const unrecognized = doc?.language.kind === "unrecognized-metadata";

  return (
    <footer className="status-bar" aria-label="Status bar">
      <button className="status-item strong" title="Course profile" onClick={() => executeCommand("tools.courseProfile")}>
        <Icon name="student" size={14} />
        {profile.short}
      </button>
      {git && (
        <button className="status-item" title={`Branch ${git.branch ?? "(detached)"}${git.files.length ? `, ${git.files.length} changed` : ""}. Click to switch.`} onClick={() => executeCommand("git.switchBranch")}>
          <Icon name="git" size={14} />
          {git.branch ?? git.head ?? "HEAD"}
          {git.files.length > 0 && "*"}
          {(git.ahead > 0 || git.behind > 0) && ` ↑${git.ahead}↓${git.behind}`}
        </button>
      )}
      {doc && (
        <button
          className={`status-item${unrecognized || doc.language.kind === "unspecified" ? " status-warn" : ""}`}
          title="Choose Language"
          onClick={() => executeCommand("tools.changeLanguage")}
        >
          <Icon name="language" size={14} />
          {unrecognized ? "Unrecognized language" : doc.language.name}
        </button>
      )}
      <button
        className={`status-item${runtime.state === "ready" && !mismatch && !runtime.message ? "" : " status-warn"}`}
        title={[rt?.executable, mismatch, runtime.message].filter(Boolean).join("\n")}
        onClick={() => setDialog("runtime")}
      >
        {runtimeLabel}
      </button>
      <ComputeStatus />
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
      {doc && cursor && (
        <button className="status-item" title="Go to Line/Column" onClick={() => executeCommand("go.line")}>
          Ln {cursor.line}, Col {cursor.col}
          {cursor.selected > 0 && ` (${cursor.selected} selected)`}
        </button>
      )}
      {doc && <span className="status-item">UTF-8{doc.hasBom ? " BOM" : ""}</span>}
      {doc && <span className="status-item">{EOL_LABEL[doc.lineEnding]}</span>}
    </footer>
  );
}
