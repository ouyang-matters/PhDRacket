// The only module that talks to the Tauri backend. Everything else in the UI
// calls these typed functions.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  DirEntry,
  FileEntry,
  FileProperties,
  FolderStats,
  InstallEvent,
  InstallPlan,
  EngineEvent,
  OpenedSource,
  RunHandle,
  RuntimeInfo,
  RuntimeStatus,
  SaveOutcome,
  SearchMatch,
  Settings,
} from "@shared/protocol";

/** Where a browser tab's page goes, in CSS pixels of the window. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserEvent =
  | { kind: "load"; id: string; url: string; loading: boolean }
  | { kind: "title"; id: string; title: string }
  | { kind: "new-tab"; id: string; url: string }
  | { kind: "blocked"; id: string; url: string };

export const backend = {
  runtimeStatus: () => invoke<RuntimeStatus>("runtime_status"),
  runtimeDiscover: () => invoke<RuntimeInfo[]>("runtime_discover"),
  runtimeSelect: (executable: string | null) => invoke<void>("runtime_select", { executable }),
  installPlan: (version: string | null) => invoke<InstallPlan>("runtime_install_plan", { version }),
  installRacket: (version: string, dest: string) => invoke<void>("runtime_install", { version, dest }),
  onInstallEvent: (f: (e: InstallEvent) => void): Promise<UnlistenFn> =>
    listen<InstallEvent>("runtime-install", (e) => f(e.payload)),

  // Explorer file operations: `root` is the open folder; paths outside it are refused.
  fsList: (root: string, dir: string) => invoke<FileEntry[]>("fs_list", { root, dir }),
  fsCreateFile: (root: string, dir: string, name: string) => invoke<string>("fs_create_file", { root, dir, name }),
  fsCreateDir: (root: string, dir: string, name: string) => invoke<string>("fs_create_dir", { root, dir, name }),
  fsRename: (root: string, path: string, name: string) => invoke<string>("fs_rename", { root, path, name }),
  fsDuplicate: (root: string, path: string) => invoke<string>("fs_duplicate", { root, path }),
  fsCopy: (root: string, src: string, dest: string) => invoke<string>("fs_copy", { root, src, dest }),
  fsMove: (root: string, src: string, dest: string) => invoke<string>("fs_move", { root, src, dest }),
  fsTrash: (root: string, path: string) => invoke<void>("fs_trash", { root, path }),
  fsProperties: (root: string, path: string) => invoke<FileProperties>("fs_properties", { root, path }),
  fsFolderStats: (root: string, dir: string) => invoke<FolderStats>("fs_folder_stats", { root, dir }),
  fsReveal: (root: string, path: string) => invoke<void>("fs_reveal", { root, path }),
  // Browser tabs (apps/desktop/src-tauri/src/browser.rs).
  browserOpen: (id: string, url: string, r: Bounds) => invoke<void>("browser_open", { id, url, ...r }),
  browserPlace: (id: string, r: Bounds, visible: boolean) => invoke<void>("browser_place", { id, ...r, visible }),
  browserNavigate: (id: string, url: string) => invoke<void>("browser_navigate", { id, url }),
  browserHistory: (id: string, action: "back" | "forward" | "reload") => invoke<void>("browser_history", { id, action }),
  browserFocus: (id: string) => invoke<void>("browser_focus", { id }),
  browserClose: (id: string) => invoke<void>("browser_close", { id }),
  onBrowserEvent: (f: (e: BrowserEvent) => void): Promise<UnlistenFn> => listen<BrowserEvent>("browser", (e) => f(e.payload)),

  watchFolder: (path: string | null) => invoke<void>("workspace_watch", { path }),
  onFolderChanged: (f: (dirs: string[]) => void): Promise<UnlistenFn> => listen<string[]>("workspace-changed", (e) => f(e.payload)),

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

  listFolder: (path: string) => invoke<DirEntry[]>("workspace_list", { path }),
  setWorkspaceFolder: (path: string | null) => invoke<void>("workspace_set_folder", { path }),
  /** Files under a folder, recursively (read-only). */
  workspaceFiles: (path: string) => invoke<string[]>("workspace_files", { path }),
  /** Find in Files (read-only). */
  workspaceSearch: (path: string, query: string, caseSensitive: boolean) =>
    invoke<SearchMatch[]>("workspace_search", { path, query, caseSensitive }),

  settings: () => invoke<Settings>("settings_get"),
  setUiSettings: (ui: unknown) => invoke<void>("settings_set_ui", { ui }),
  appInfo: () => invoke<AppInfo>("app_info"),
  fetchAnnouncements: () => invoke<string>("announcements_fetch"),

  onEngineEvent: (f: (e: EngineEvent) => void): Promise<UnlistenFn> =>
    listen<EngineEvent>("engine", (e) => f(e.payload)),
  onRuntimeStatus: (f: (s: RuntimeStatus) => void): Promise<UnlistenFn> =>
    listen<RuntimeStatus>("runtime-status", (e) => f(e.payload)),
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
