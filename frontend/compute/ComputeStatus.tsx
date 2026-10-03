// "◉ Local" / "◉ DGX · Connected" in the status bar. Clicking it picks the
// compute target.

import { useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { Icon } from "@frontend/workbench/icons";
import { useCompute } from "./compute";

const LABEL = { unknown: "", checking: "Checking…", connected: "Connected", offline: "Offline" } as const;

export function ComputeStatus() {
  const target = useApp((s) => s.prefs.computeHosts.find((h) => h.id === s.prefs.computeTarget) ?? null);
  const connection = useCompute((c) => (target ? (c.connections[target.id]?.state ?? "unknown") : "connected"));
  const running = useCompute((c) => c.tasks.filter((t) => t.status === "running").length);
  const remote = target !== null;
  return (
    <button
      className={`status-item compute-status${remote ? ` remote-${connection}` : ""}`}
      title={remote ? `Compute: ${target.name} (${target.host}). Run uses this computer; Run Remotely uses ${target.name}.` : "Compute: this computer"}
      onClick={() => executeCommand("compute.selectTarget")}
    >
      <Icon name={remote ? (connection === "offline" ? "remoteOff" : "remoteOn") : "local"} size={14} />
      {remote ? `${target.name}${LABEL[connection] ? ` · ${LABEL[connection]}` : ""}` : "Local"}
      {running > 0 && <span className="badge">{running}</span>}
    </button>
  );
}
