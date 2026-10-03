import { useState } from "react";
import type { Srcloc } from "@shared/protocol";
import { activate, getState, useApp } from "@frontend/app/store";
import { revealRange } from "@frontend/editor/EditorArea";
import { sameSourcePath, srclocToRange } from "@frontend/editor/srcloc";
import type { Diagnostic } from "@frontend/run/session";

/** Where a srcloc points, if it is in the file that was run. */
export function locate(loc: Srcloc | undefined, origin: Diagnostic["origin"]) {
  if (!loc || origin !== "definitions") return null;
  const s = getState();
  const doc = s.docs.find((d) => d.id === s.run.docId);
  if (!doc) return null;
  if (loc.source !== null && doc.path && !sameSourcePath(loc.source, doc.path)) return null;
  const text = doc.model.getValue();
  const range = srclocToRange(text, loc);
  if (!range) return null;
  return { doc, range };
}

export function goTo(loc: Srcloc | undefined, origin: Diagnostic["origin"]) {
  const target = locate(loc, origin);
  if (!target) return;
  if (getState().activeId !== target.doc.id) {
    activate(target.doc.id);
    requestAnimationFrame(() => revealRange(target.range));
  } else {
    revealRange(target.range);
  }
}

function fileLabel(loc: Srcloc): string {
  const name = loc.source ? loc.source.split(/[\\/]/).pop() : "";
  return `${name}${loc.line != null ? `:${loc.line}` : ""}${loc.column != null ? `:${loc.column}` : ""}`;
}

/** The source line with the reported range underlined. */
function Excerpt({ diagnostic }: { diagnostic: Diagnostic }) {
  useApp((s) => s.revision);
  const target = locate(diagnostic.srcloc, diagnostic.origin);
  if (!target) return null;
  const { doc, range } = target;
  const line = doc.model.getLineContent(range.startLineNumber);
  const endCol = range.endLineNumber === range.startLineNumber ? range.endColumn : line.length + 1;
  const width = Math.max(1, endCol - range.startColumn);
  const gutter = String(range.startLineNumber);
  return (
    <pre className="excerpt" aria-label="Source excerpt">
      <span className="excerpt-gutter">{gutter} │ </span>
      {line}
      {"\n"}
      <span className="excerpt-gutter">{" ".repeat(gutter.length)} │ </span>
      {" ".repeat(range.startColumn - 1)}
      <span className="excerpt-caret">{"^".repeat(Math.min(width, Math.max(1, line.length - range.startColumn + 2)))}</span>
    </pre>
  );
}

export function DiagnosticView({ diagnostic, compact = false }: { diagnostic: Diagnostic; compact?: boolean }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const differs = diagnostic.originalMessage !== undefined && diagnostic.originalMessage !== diagnostic.message;
  const target = locate(diagnostic.srcloc, diagnostic.origin);
  return (
    <div className={`diagnostic cat-${diagnostic.category} sev-${diagnostic.severity}${compact ? " compact" : ""}`}>
      <div className="diag-head">
        <span className="diag-label">{diagnostic.label}</span>
        {diagnostic.srcloc && target && (
          <button className="link diag-loc" onClick={() => goTo(diagnostic.srcloc, diagnostic.origin)}>
            {fileLabel(diagnostic.srcloc)}
          </button>
        )}
      </div>
      <pre className="diag-message">{diagnostic.message}</pre>
      {!compact && <Excerpt diagnostic={diagnostic} />}
      {differs && (
        <div className="diag-original">
          <button className="link" onClick={() => setShowOriginal((v) => !v)} aria-expanded={showOriginal}>
            {showOriginal ? "Hide" : "Show"} original Racket message
          </button>
          {showOriginal && <pre>{diagnostic.originalMessage}</pre>}
        </div>
      )}
    </div>
  );
}
