// The Debug panel: controls, the paused expression, variables of the
// selected frame, the call stack, and every breakpoint.

import { activateTab, getState, useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { monaco } from "@frontend/editor/monaco";
import { Icon, type IconName } from "@frontend/workbench/icons";
import { allBreakpoints, removeAllBreakpoints, selectFrame, toggleBreakpoint, useDebug } from "./debugger";

function Control({ command, icon, label }: { command: string; icon: IconName; label: string }) {
  const key = keybindingFor(command);
  return (
    <button className="icon-button labeled" title={`${label}${key ? ` (${formatKey(key)})` : ""}`} onClick={() => executeCommand(command)}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

/** The source text of a range, on one line, shortened. */
function snippet(docId: string | null, position: number | null, span: number): string {
  const doc = getState().docs.find((d) => d.id === docId);
  if (!doc || position === null) return "";
  const text = [...doc.model.getValue()].slice(position, position + span).join("");
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 57)}…` : one;
}

function reveal(docId: string, line: number) {
  const group = Object.values(getState().layout.groups).find((g) => g.tabs.includes(docId));
  if (group) activateTab(group.id, docId);
  const doc = getState().docs.find((d) => d.id === docId);
  for (const editor of monaco.editor.getEditors()) {
    if (editor.getModel() === doc?.model) {
      editor.revealLineInCenterIfOutsideViewport(line);
      editor.setPosition({ lineNumber: line, column: 1 });
    }
  }
}

function Breakpoints() {
  useApp((s) => s.revision);
  useDebug((s) => s.verified);
  const list = allBreakpoints();
  return (
    <section className="debug-section">
      <h3>
        Breakpoints
        {list.length > 0 && (
          <button className="link small" onClick={removeAllBreakpoints}>
            Remove all
          </button>
        )}
      </h3>
      {list.length === 0 ? (
        <p className="muted small">Click in the margin left of a line number, or press F9 on a line.</p>
      ) : (
        <ul className="debug-list">
          {list.map(({ doc, line }) => (
            <li key={`${doc.id}:${line}`}>
              <span className="phd-breakpoint-dot" aria-hidden />
              <button className="link" onClick={() => reveal(doc.id, line)}>
                {doc.name}:{line}
              </button>
              <span className="muted small debug-code">{doc.model.getLineContent(Math.min(line, doc.model.getLineCount())).trim()}</span>
              <button className="icon-button" title="Remove breakpoint" aria-label="Remove breakpoint" onClick={() => toggleBreakpoint(doc.model, line)}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DebugPanel() {
  const status = useDebug((s) => s.status);
  const paused = useDebug((s) => s.paused);
  const frameIndex = useDebug((s) => s.frame);
  const docId = useDebug((s) => s.docId);
  const frame = paused?.frames[frameIndex] ?? null;

  return (
    <div className="debug-panel">
      <div className="debug-toolbar">
        {status === "off" ? (
          <Control command="debug.start" icon="bug" label="Debug" />
        ) : status === "paused" ? (
          <>
            <Control command="debug.continue" icon="run" label="Continue" />
            <Control command="debug.stepOver" icon="stepOver" label="Step Over" />
            <Control command="debug.stepInto" icon="stepInto" label="Step Into" />
            <Control command="debug.stepOut" icon="stepOut" label="Step Out" />
          </>
        ) : status === "running" ? (
          <Control command="debug.pause" icon="pause" label="Pause" />
        ) : null}
        {status !== "off" && <Control command="run.stop" icon="stop" label="Stop" />}
        <span className="debug-status muted">
          {status === "off" && "Not debugging."}
          {status === "running" && "Running…"}
          {status === "idle" && "The program finished. Its breakpoints still apply to Interactions."}
          {status === "paused" && paused && (
            <>
              Paused {paused.kind === "before" ? "before" : "after"} <code>{snippet(docId, paused.position, paused.span)}</code> on line {paused.line}
              {paused.kind === "after" && paused.value !== null && (
                <>
                  {" "}
                  ⇒ <code className="debug-value">{paused.value}</code>
                </>
              )}
            </>
          )}
        </span>
      </div>
      <div className="debug-body">
        {status === "paused" && paused ? (
          <>
            <section className="debug-section">
              <h3>Variables</h3>
              {frame && frame.bindings.length > 0 ? (
                <table className="debug-vars">
                  <tbody>
                    {frame.bindings.map((b, i) => (
                      <tr key={`${b.name}-${i}`}>
                        <td className="debug-var-name">{b.name}</td>
                        <td className="debug-value">{b.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small">No local variables here.</p>
              )}
            </section>
            <section className="debug-section">
              <h3>Call Stack</h3>
              <ul className="debug-list" role="listbox" aria-label="Call stack">
                {paused.frames.map((f, i) => (
                  <li key={i} className={i === frameIndex ? "selected" : ""}>
                    <button className="link" role="option" aria-selected={i === frameIndex} onClick={() => selectFrame(i)}>
                      <code>{snippet(docId, f.position, f.span) || "(expression)"}</code>
                    </button>
                    {f.line !== null && <span className="muted small">line {f.line}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className="debug-section debug-help">
            <h3>How to debug</h3>
            <p className="small">
              Set breakpoints by clicking in the margin left of the line numbers (F9), then press <strong>Debug</strong> (F6). The program
              stops before evaluating an expression on a breakpoint line. Then step through it: Step Over (F10) evaluates the expression,
              Step Into (F11) goes inside it, Step Out (Shift+F11) finishes the current call, Continue (F5) runs to the next breakpoint.
              Pause (F6) stops a running program wherever it is. Hover a name to see its value.
            </p>
          </section>
        )}
        <Breakpoints />
      </div>
    </div>
  );
}
