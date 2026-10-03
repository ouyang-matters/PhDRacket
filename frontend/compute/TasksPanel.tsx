// Remote tasks: status, elapsed time, output, cancel. Editing continues while
// tasks run.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@frontend/workbench/icons";
import { cancelTask, clearFinishedTasks, runRemotely, useCompute, type RemoteTask } from "./compute";

function elapsed(t: RemoteTask, now: number): string {
  const s = Math.round(((t.endedAt ?? now) - t.startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const STATUS = { running: "Running", complete: "Complete", failed: "Failed", cancelled: "Cancelled" } as const;

export function TasksPanel() {
  const tasks = useCompute((c) => c.tasks);
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const out = useRef<HTMLPreElement>(null);
  const running = tasks.some((t) => t.status === "running");
  const task = tasks.find((t) => t.id === selected) ?? tasks[0] ?? null;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const el = out.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [task?.output.length]);

  if (tasks.length === 0) {
    return (
      <div className="panel-empty">
        No remote tasks. <button className="link" onClick={() => void runRemotely()}>Run Remotely</button> runs the current file on the selected host.
      </div>
    );
  }

  return (
    <div className="tasks">
      <ul className="task-list" aria-label="Remote tasks">
        {tasks.map((t) => (
          <li key={t.id}>
            <button className={`task-row${task?.id === t.id ? " selected" : ""}`} onClick={() => setSelected(t.id)}>
              <span className={`task-status ${t.status}`}>
                <Icon name={t.status === "running" ? "dot" : t.status === "complete" ? "pass" : "fail"} size={14} />
              </span>
              <span className="task-title">{t.title}</span>
              <span className="muted small">{t.hostName}</span>
              <span className="muted small">{STATUS[t.status]}</span>
              <span className="muted small mono">{elapsed(t, now)}</span>
            </button>
          </li>
        ))}
        <li className="task-actions">
          <button className="link" onClick={clearFinishedTasks} disabled={!tasks.some((t) => t.status !== "running")}>
            Clear finished
          </button>
        </li>
      </ul>
      {task && (
        <section className="task-output" aria-label={`Output of ${task.title}`}>
          <div className="task-output-bar">
            <span>
              {task.title} · {task.hostName}
              {task.exitCode !== null && ` · exit ${task.exitCode}`}
            </span>
            <span className="toolbar-spacer" />
            {task.status === "running" && (
              <button className="small-btn" onClick={() => cancelTask(task.id)}>
                Cancel
              </button>
            )}
          </div>
          <pre ref={out} className="task-log">
            {task.output.map((o, i) => (
              <span key={i} className={`task-${o.stream}`}>
                {o.text}
              </span>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}
