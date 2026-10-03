import { useState } from "react";
import { useApp } from "@frontend/app/store";
import { goTo, locate } from "@frontend/problems/DiagnosticView";

/** Presents the official test engine's results. Pass/fail counts and the
 * report text come from htdp's test engine unchanged. */
export function TestsPanel() {
  const tests = useApp((s) => s.run.tests);
  const definitionsOk = useApp((s) => s.run.definitionsOk);
  const session = useApp((s) => s.run.session);
  const [showReport, setShowReport] = useState(true);
  useApp((s) => s.revision);

  if (session === null) return <div className="panel-empty">No test results.</div>;
  if (!tests) {
    return (
      <div className="panel-empty">
        {definitionsOk === false ? "Tests did not run: the program stopped with an error." : "No tests."}
      </div>
    );
  }
  const passed = tests.total - tests.failed;
  return (
    <div className="tests">
      <div className="tests-summary" role="status">
        <span className={tests.failed === 0 ? "ok" : "muted"}>{passed} passed</span>
        <span className={tests.failed > 0 ? "fail" : "muted"}>{tests.failed} failed</span>
        {tests.signatureViolations > 0 && <span className="fail">{tests.signatureViolations} signature violations</span>}
        <span className="muted">
          of {tests.total}
        </span>
      </div>
      {tests.failures.length > 0 && (
        <ul className="test-failures">
          {tests.failures.map((loc, i) => (
            <li key={i}>
              {loc && locate(loc, tests.origin) ? (
                <button className="link" onClick={() => goTo(loc, tests.origin)}>
                  Failed check at line {loc.line}, column {loc.column}
                </button>
              ) : (
                <span>Failed check{loc?.line != null ? ` at line ${loc.line}` : ""}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={() => setShowReport((v) => !v)} aria-expanded={showReport}>
        {showReport ? "Hide" : "Show"} report
      </button>
      {showReport && <pre className="tests-report">{tests.report || "(no report)"}</pre>}
    </div>
  );
}
