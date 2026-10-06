import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorArea } from "@frontend/editor/EditorArea";
import { StatusBar } from "@frontend/status-bar/StatusBar";
import { dispatchKey, keyContextOf, setKeybindingOverrides, formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { commandsChanged, executeCommand } from "@frontend/commands/registry";
import { applyTheme } from "@frontend/theme/apply";
import { resolveThemeChoice } from "@frontend/theme/engine";
import { MenuBar } from "@frontend/workbench/MenuBar";
import { ActivityBar, Sidebar } from "@frontend/workbench/sidebar";
import { BottomPanel } from "@frontend/workbench/panels";
import { QuickInputHost } from "@frontend/workbench/QuickInput";
import { ContextMenuHost } from "@frontend/workbench/ContextMenu";
import { installBuiltinCommands } from "@frontend/workbench/builtin-commands";
import { installBuiltinViews } from "@frontend/workbench/builtin-views";
import { installAnalysis } from "@frontend/analysis/analysis";
import { installDebugger } from "@frontend/debug/debugger";
import { Icon } from "@frontend/workbench/icons";
import { Dialogs } from "./Dialogs";
import { checkForUpdates, updateState, useUpdate } from "./updates";
import { confirmQuit, dismissNotice, getState, initialize, loadAnnouncements, setDialog, subscribe, termsAccepted, useApp } from "./store";

installBuiltinCommands();
installBuiltinViews();
installAnalysis();
installDebugger();

// Menus and toolbars show enablement from application state.
subscribe(commandsChanged);

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Opens Quick Open: the search box in the middle of the menu bar. */
function CommandCenter() {
  const folder = useApp((s) => s.folder);
  const key = keybindingFor("workbench.quickOpen");
  const name = folder ? folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : "PhDRacket";
  return (
    <button className="command-center" onClick={() => executeCommand("workbench.quickOpen")} title={`Go to File${key ? ` (${formatKey(key)})` : ""}`}>
      <Icon name="search" size={14} />
      <span>{name}</span>
    </button>
  );
}

function Notices() {
  const notices = useApp((s) => s.notices);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`}>
          <span>{n.text}</span>
          <button className="icon" aria-label="Dismiss" onClick={() => dismissNotice(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** One dispatcher for workbench keys, before the editors see them. Keys the
 * editor owns (typing, undo, find, multi-cursor) are left alone. */
function useKeybindings() {
  const overrides = useApp((s) => s.prefs.keybindings);
  useEffect(() => setKeybindingOverrides(overrides), [overrides]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      // Nothing but the Setup dialog works until the Beta Terms are accepted.
      if (!termsAccepted(getState())) return;
      if (dispatchKey(e, keyContextOf(document.activeElement))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** The theme, interface scale and motion preferences, applied to the whole window. */
function useAppearance() {
  const theme = useApp((s) => s.prefs.theme);
  const uiScale = useApp((s) => s.prefs.uiScale);
  const reducedMotion = useApp((s) => s.prefs.reducedMotion);
  useEffect(() => {
    const apply = () => applyTheme(resolveThemeChoice(theme, prefersDark()));
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  const startupAnimation = useApp((s) => s.prefs.startupAnimation);
  useEffect(() => {
    try {
      // Read by the startup screen in index.html at the next launch.
      localStorage.setItem("phdracket.startupAnimation", startupAnimation);
    } catch {
      // Storage unavailable: the startup screen uses its default.
    }
  }, [startupAnimation]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${13 * uiScale}px`;
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [uiScale, reducedMotion]);
}

export function App() {
  const prefs = useApp((s) => s.prefs);
  const zen = useApp((s) => s.zen);
  const maximized = useApp((s) => s.panelMaximized);
  const accepted = useApp((s) => termsAccepted(s));
  useKeybindings();
  useAppearance();

  // An update found by the startup check opens the update dialog once, as
  // soon as no other dialog (Setup, Terms, announcements) is showing.
  const startupUpdate = useRef(false);
  const update = useUpdate();
  const openDialog = useApp((s) => s.dialog);
  useEffect(() => {
    if (startupUpdate.current && update.status === "available" && openDialog === null && accepted) {
      startupUpdate.current = false;
      setDialog("update");
    }
  }, [update.status, openDialog, accepted]);

  useEffect(() => {
    void initialize().then(() => {
      // The workbench is ready: end the startup screen (apps/desktop/index.html).
      window.dispatchEvent(new Event("phdracket-ready"));
      // Quiet check shortly after startup, in release builds only.
      if (!import.meta.env.DEV && getState().prefs.checkForUpdates) {
        setTimeout(() => {
          startupUpdate.current = true;
          void checkForUpdates(true).then(() => {
            if (updateState().status !== "available") startupUpdate.current = false;
          });
        }, 4000);
      }
      void loadAnnouncements();
    });
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (!(await confirmQuit())) event.preventDefault();
    });
    return () => void unlisten.then((f) => f());
  }, []);

  // Show queued announcements when no other dialog is open.
  const dialog = useApp((s) => s.dialog);
  const announcementCount = useApp((s) => s.announcements.length);
  useEffect(() => {
    if (dialog === null && announcementCount > 0) setDialog("announcement");
  }, [dialog, announcementCount]);

  // Without a usable Racket, open Setup (once per launch).
  const runtimeState = useApp((s) => s.runtime.state);
  const setupPrompted = useRef(false);
  useEffect(() => {
    if ((runtimeState === "missing" || runtimeState === "error") && !setupPrompted.current) {
      setupPrompted.current = true;
      if (getState().dialog === null) setDialog("setup");
    }
  }, [runtimeState]);

  const showMenu = prefs.menuBarVisible && !zen;
  const showSidebar = prefs.explorerVisible && !zen;
  const showPanel = prefs.panelVisible && !zen;

  return (
    <div className="workbench">
      {showMenu && (
        <MenuBar locked={!accepted}>
          <CommandCenter />
          <div className="menubar-spacer" data-tauri-drag-region />
        </MenuBar>
      )}
      <div className="workbench-body">
        {!zen && <ActivityBar />}
        {showSidebar && <Sidebar />}
        <main className="workbench-main">
          <div className="editor-region" hidden={showPanel && maximized}>
            <EditorArea />
          </div>
          {showPanel && <BottomPanel />}
        </main>
      </div>
      {prefs.statusBarVisible && !zen && <StatusBar />}
      <Dialogs />
      <Notices />
      <QuickInputHost />
      <ContextMenuHost />
    </div>
  );
}
