// Update checks against the project's GitHub releases (Tauri updater; the
// update file is signed and verified before installing). Nothing is
// downloaded or installed without the user's click.

import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  /** 0..1 while downloading, when the size is known. */
  progress: number | null;
  error: string | null;
}

let state: UpdateState = { status: "idle", version: null, notes: null, progress: null, error: null };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function updateState(): UpdateState {
  return state;
}

export function useUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Checks for a newer release. A quiet check does not report failures. */
export async function checkForUpdates(quiet = false): Promise<void> {
  if (state.status === "checking" || state.status === "downloading") return;
  set({ status: "checking", error: null });
  try {
    pending = await check();
    if (pending) set({ status: "available", version: pending.version, notes: pending.body ?? null });
    else set({ status: "none" });
  } catch (e) {
    set(quiet ? { status: "idle" } : { status: "error", error: String(e) });
  }
}

export async function installUpdate(): Promise<void> {
  if (!pending) return;
  let total = 0;
  let received = 0;
  set({ status: "downloading", progress: null });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        received += event.data.chunkLength;
        if (total > 0) set({ progress: received / total });
      } else if (event.event === "Finished") set({ status: "ready", progress: 1 });
    });
    set({ status: "ready" });
    await relaunch();
  } catch (e) {
    set({ status: "error", error: String(e) });
  }
}
