import { useApp } from "@frontend/app/store";

/** Raw program output (stdout/stderr) and session messages, unformatted. */
export function OutputPanel() {
  const transcript = useApp((s) => s.run.transcript);
  const endedReason = useApp((s) => s.run.endedReason);
  const runtime = useApp((s) => s.runtime);
  const output = transcript.filter((e) => e.kind === "stdout" || e.kind === "stderr" || e.kind === "info");
  return (
    <div className="output">
      <div className="muted small">
        Racket: {runtime.runtime ? `${runtime.runtime.version} (${runtime.runtime.vm}), ${runtime.runtime.executable}` : runtime.state}
        {endedReason && ` · last session ${endedReason}`}
      </div>
      {output.length === 0 ? (
        <div className="panel-empty">No output.</div>
      ) : (
        output.map((e) => (
          <pre key={e.id} className={`tx tx-${e.kind}`}>
            {e.text}
          </pre>
        ))
      )}
    </div>
  );
}
