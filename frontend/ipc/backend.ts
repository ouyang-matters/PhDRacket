// The only module that talks to the Tauri backend. Everything else in the UI
// calls these typed functions.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  EngineEvent,
  OpenedSource,
  RunHandle,
  RuntimeInfo,
  RuntimeStatus,
  SaveOutcome,
  Settings,
} from "@shared/protocol";

export const backend = {
  runtimeStatus: () => invoke<RuntimeStatus>("runtime_status"),
  runtimeDiscover: () => invoke<RuntimeInfo[]>("runtime_discover"),
  runtimeSelect: (executable: string | null) => invoke<void>("runtime_select", { executable }),

  openSource: (path: string) => invoke<OpenedSource>("source_open", { path }),
  saveSource: (path: string, text: string) => invoke<SaveOutcome>("source_save", { path, text }),
  saveSourceAs: (from: string | null, path: string, text: string) =>
    invoke<SaveOutcome>("source_save_as", { from, path, text }),
  closeSource: (path: string) => invoke<void>("source_close", { path }),

  run: (path: string | null, text: string) => invoke<RunHandle>("run_program", { path, text }),
  evalInteraction: (text: string) => invoke<RunHandle>("eval_interaction", { text }),
  stop: () => invoke<boolean>("stop_program"),
  step: (path: string | null, text: string) => invoke<RunHandle>("step_program", { path, text }),
  stopStepper: () => invoke<boolean>("stop_stepper"),

  settings: () => invoke<Settings>("settings_get"),
  setUiSettings: (ui: unknown) => invoke<void>("settings_set_ui", { ui }),
  appInfo: () => invoke<AppInfo>("app_info"),

  onEngineEvent: (f: (e: EngineEvent) => void): Promise<UnlistenFn> =>
    listen<EngineEvent>("engine", (e) => f(e.payload)),
  onRuntimeStatus: (f: (s: RuntimeStatus) => void): Promise<UnlistenFn> =>
    listen<RuntimeStatus>("runtime-status", (e) => f(e.payload)),
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
