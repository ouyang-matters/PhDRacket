import { useApp } from "@frontend/app/store";
import { DiagnosticView } from "./DiagnosticView";

const ORDER = ["syntax", "language", "racket", "test", "course", "editor"];

export function ProblemsPanel() {
  const diagnostics = useApp((s) => s.run.diagnostics);
  const session = useApp((s) => s.run.session);
  if (session === null) return <div className="panel-empty">No problems.</div>;
  const shown = diagnostics
    .filter((d) => d.category !== "test")
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  if (shown.length === 0) return <div className="panel-empty">No problems.</div>;
  return (
    <div className="problems">
      {shown.map((d) => (
        <DiagnosticView key={d.id} diagnostic={d} />
      ))}
    </div>
  );
}
