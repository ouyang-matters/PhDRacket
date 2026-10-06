import { activeDoc, useApp } from "@frontend/app/store";
import { liveProblems, useAnalysisVersion } from "@frontend/analysis/analysis";
import { monaco } from "@frontend/editor/monaco";
import { DiagnosticView } from "./DiagnosticView";

const ORDER = ["syntax", "language", "racket", "test", "course", "editor"];

/** Problems found while typing (frontend/analysis), for the active file. */
function LiveProblems() {
  useAnalysisVersion();
  const doc = useApp((s) => activeDoc(s));
  const enabled = useApp((s) => s.prefs.liveCheck);
  if (!doc || !enabled) return null;
  const { diagnostics } = liveProblems(doc.model);
  if (diagnostics.length === 0) return null;
  const go = (line: number, column: number) => {
    for (const editor of monaco.editor.getEditors()) {
      if (editor.getModel() !== doc.model) continue;
      editor.setPosition({ lineNumber: line, column: column + 1 });
      editor.revealLineInCenterIfOutsideViewport(line);
      editor.focus();
    }
  };
  return (
    <section className="live-problems" aria-label="Problems found while typing">
      <h3>
        In {doc.name}, while typing <span className="muted small">(checked by Racket, not run)</span>
      </h3>
      <ul>
        {diagnostics.map((d, i) => (
          <li key={i} className={d.severity}>
            <button className="link" onClick={() => go(d.line, d.column)}>
              {doc.name}:{d.line}:{d.column + 1}
            </button>{" "}
            <span className="live-problem-message">{d.message.replace(/\n {2}in: [\s\S]*$/, "")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProblemsPanel() {
  const diagnostics = useApp((s) => s.run.diagnostics);
  const session = useApp((s) => s.run.session);
  const shown =
    session === null
      ? []
      : diagnostics.filter((d) => d.category !== "test").sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  const live = <LiveProblems />;
  if (shown.length === 0) {
    return (
      <div className="problems">
        {live}
        <LiveEmpty />
      </div>
    );
  }
  return (
    <div className="problems">
      {live}
      {shown.map((d) => (
        <DiagnosticView key={d.id} diagnostic={d} />
      ))}
    </div>
  );
}

function LiveEmpty() {
  useAnalysisVersion();
  const doc = useApp((s) => activeDoc(s));
  const enabled = useApp((s) => s.prefs.liveCheck);
  if (doc && enabled && liveProblems(doc.model).diagnostics.length > 0) return null;
  return <div className="panel-empty">No problems.</div>;
}
