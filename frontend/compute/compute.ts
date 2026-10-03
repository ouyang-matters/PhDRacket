// Compute targets and remote tasks. "Local" is always available and is what
// Run uses. Remote hosts run long programs as tasks (Run Remotely) whose
// output streams into the Tasks panel while editing continues.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { activeDoc, getState, notify, setPanel, setPrefs } from "@frontend/app/store";
import type { ComputeHost } from "@frontend/settings/preferences";

export type Connection = "unknown" | "checking" | "connected" | "offline";

export interface RemoteTask {
  id: number;
  hostId: string;
  hostName: string;
  title: string;
  status: "running" | "complete" | "failed" | "cancelled";
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  output: { stream: "stdout" | "stderr" | "info"; text: string }[];
}

interface ComputeState {
  connections: Record<string, { state: Connection; detail: string | null }>;
  tasks: RemoteTask[];
}

let state: ComputeState = { connections: {}, tasks: [] };
const listeners = new Set<() => void>();

function set(patch: Partial<ComputeState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useCompute<T>(select: (s: ComputeState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export function computeHosts(): ComputeHost[] {
  return getState().prefs.computeHosts;
}

export function currentTarget(): ComputeHost | null {
  const id = getState().prefs.computeTarget;
  return computeHosts().find((h) => h.id === id) ?? null;
}

export function connectionOf(hostId: string) {
  return state.connections[hostId] ?? { state: "unknown" as Connection, detail: null };
}

function setConnection(hostId: string, c: { state: Connection; detail: string | null }) {
  set({ connections: { ...state.connections, [hostId]: c } });
}

/** Checks a host over SSH; reports its Racket version. */
export async function checkHost(host: ComputeHost): Promise<boolean> {
  setConnection(host.id, { state: "checking", detail: null });
  try {
    const version = await invoke<string>("remote_probe", { host: host.host, racket: host.racket });
    setConnection(host.id, { state: "connected", detail: version });
    return true;
  } catch (e) {
    setConnection(host.id, { state: "offline", detail: String(e) });
    return false;
  }
}

export function selectTarget(id: string) {
  setPrefs({ computeTarget: id });
  const host = computeHosts().find((h) => h.id === id);
  if (host) void checkHost(host);
}

export function saveHosts(hosts: ComputeHost[]) {
  const target = getState().prefs.computeTarget;
  setPrefs({ computeHosts: hosts, computeTarget: hosts.some((h) => h.id === target) ? target : "local" });
}

function updateTask(id: number, f: (t: RemoteTask) => RemoteTask) {
  set({ tasks: state.tasks.map((t) => (t.id === id ? f(t) : t)) });
}

const MAX_OUTPUT_LINES = 5000;

/** Runs the active file on the selected remote host as a task. */
export async function runRemotely(): Promise<void> {
  const host = currentTarget();
  const doc = activeDoc();
  if (!doc) return;
  if (!host) {
    notify("info", "Choose a remote host first (Tools > Remote Compute).");
    return;
  }
  try {
    const id = await invoke<number>("remote_run", { host: host.host, racket: host.racket, fileName: doc.name, text: doc.model.getValue() });
    const task: RemoteTask = {
      id,
      hostId: host.id,
      hostName: host.name,
      title: `racket ${doc.name}`,
      status: "running",
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      output: [{ stream: "info", text: `Running ${doc.name} on ${host.name} (${host.host})…\n` }],
    };
    set({ tasks: [task, ...state.tasks.filter((t) => t.id !== id)].slice(0, 50) });
    setPanel("tasks");
  } catch (e) {
    notify("error", String(e));
  }
}

export function cancelTask(id: number) {
  void invoke<boolean>("remote_cancel", { task: id });
}

export function clearFinishedTasks() {
  set({ tasks: state.tasks.filter((t) => t.status === "running") });
}

type TaskEvent =
  | { kind: "output"; task: number; stream: "stdout" | "stderr"; text: string }
  | { kind: "exit"; task: number; code: number | null; cancelled: boolean };

let listening = false;

/** Subscribes to task events from the backend (once). */
export async function startCompute() {
  if (listening) return;
  listening = true;
  await listen<TaskEvent>("compute-task", ({ payload: e }) => {
    if (e.kind === "output") {
      updateTask(e.task, (t) => ({ ...t, output: [...t.output, { stream: e.stream, text: e.text }].slice(-MAX_OUTPUT_LINES) }));
    } else {
      updateTask(e.task, (t) => ({
        ...t,
        status: e.cancelled ? "cancelled" : e.code === 0 ? "complete" : "failed",
        exitCode: e.code,
        endedAt: Date.now(),
      }));
      const t = state.tasks.find((x) => x.id === e.task);
      if (t?.status === "failed") setConnectionAfterFailure(t);
    }
  });
  const host = currentTarget();
  if (host) void checkHost(host);
}

/** ssh exits with 255 when the connection itself failed. */
function setConnectionAfterFailure(t: RemoteTask) {
  if (t.exitCode === 255) setConnection(t.hostId, { state: "offline", detail: "Connection failed" });
}

export function newHostId(): string {
  return `host-${Date.now().toString(36)}`;
}
