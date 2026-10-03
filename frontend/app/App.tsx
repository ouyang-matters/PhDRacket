import { useEffect, useRef, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorArea } from "@frontend/editor/EditorArea";
import { InteractionsPanel } from "@frontend/interactions/InteractionsPanel";
import { OutputPanel } from "@frontend/problems/OutputPanel";
import { ProblemsPanel } from "@frontend/problems/ProblemsPanel";
import { StatusBar } from "@frontend/status-bar/StatusBar";
import { TestsPanel } from "@frontend/tests/TestsPanel";
import { StepperPanel } from "@frontend/stepper/StepperPanel";
import { Explorer } from "@frontend/explorer/Explorer";
import { resolveTheme } from "@frontend/settings/preferences";
import { Dialogs } from "./Dialogs";
import { checkForUpdates } from "./updates";
import { loadAnnouncements } from "./store";
import {
  activeDoc,
  confirmQuit,
  dismissNotice,
  getState,
  initialize,
  openFolderWithDialog,
  openWithDialog,
  runActive,
  saveDoc,
  setDialog,
  setPanel,
  setPrefs,
  stepActive,
  stopProgram,
  toggleExplorer,
  useApp,
  type PanelTab,
} from "./store";

function Toolbar() {
  const doc = useApp((s) => activeDoc(s));
  const status = useApp((s) => s.run.status);
  const ready = useApp((s) => s.runtime.state === "ready");
  return (
    <header className="toolbar">
      <span className="brand" aria-label="PhDRacket">
        PhD<span>Racket</span>
      </span>
      <nav className="toolbar-group" aria-label="File">
        <button onClick={() => setDialog("new-file")} title="New file (Ctrl+N)">New</button>
        <button onClick={() => void openWithDialog()} title="Open file (Ctrl+O)">Open</button>
        <button onClick={() => void openFolderWithDialog()} title="Open folder (Ctrl+Shift+O)">Open Folder</button>
        <button onClick={() => void saveDoc()} disabled={!doc} title="Save (Ctrl+S)">Save</button>
      </nav>
      <span className="toolbar-spacer" />
      <div className="toolbar-group">
        {status === "running" && (
          <button className="stop" onClick={() => void stopProgram()} title="Stop the running program">
            Stop
          </button>
        )}
        <button onClick={() => void stepActive()} disabled={!doc || !ready} title="Step (Ctrl+Shift+Enter)">
          Step
        </button>
        <button className="run" onClick={() => void runActive()} disabled={!doc || !ready} title="Run (Ctrl+Enter)">
          Run
        </button>
      </div>
      <nav className="toolbar-group" aria-label="Application">
        <button onClick={() => setDialog("settings")} title="Settings">Settings</button>
        <button onClick={() => setDialog("about")} title="About PhDRacket">About</button>
      </nav>
    </header>
  );
}

const PANELS: { id: PanelTab; label: string }[] = [
  { id: "problems", label: "Problems" },
  { id: "tests", label: "Tests" },
  { id: "interactions", label: "Interactions" },
  { id: "stepper", label: "Stepper" },
  { id: "output", label: "Output" },
];

function PanelTabs() {
  const panel = useApp((s) => s.panel);
  const failed = useApp((s) => s.run.tests?.failed ?? 0);
  const problems = useApp((s) => s.run.diagnostics.filter((d) => d.category !== "test").length);
  return (
    <div className="panel-tabs" role="tablist" aria-label="Panels">
      {PANELS.map((p) => (
        <button key={p.id} role="tab" aria-selected={panel === p.id} className={panel === p.id ? "active" : ""} onClick={() => setPanel(p.id)}>
          {p.label}
          {p.id === "tests" && failed > 0 && <span className="badge fail">{failed}</span>}
          {p.id === "problems" && problems > 0 && <span className="badge">{problems}</span>}
        </button>
      ))}
    </div>
  );
}

function BottomPanel() {
  const panel = useApp((s) => s.panel);
  const height = useApp((s) => s.prefs.panelHeight);
  const dragging = useRef(false);
  const views: Record<PanelTab, ReactNode> = {
    interactions: <InteractionsPanel />,
    tests: <TestsPanel />,
    problems: <ProblemsPanel />,
    stepper: <StepperPanel />,
    output: <OutputPanel />,
  };
  return (
    <section className="bottom-panel" style={{ height }}>
      <div
        className="splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const h = Math.min(Math.max(window.innerHeight - e.clientY - 24, 90), window.innerHeight - 160);
          setPrefs({ panelHeight: Math.round(h) });
        }}
        onPointerUp={() => (dragging.current = false)}
      />
      <PanelTabs />
      <div className="panel-body">
        {/* Interactions stays mounted so its input editor and history persist. */}
        <div hidden={panel !== "interactions"} className="panel-view">
          {views.interactions}
        </div>
        {panel !== "interactions" && <div className="panel-view">{views[panel]}</div>}
      </div>
    </section>
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

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        void openFolderWithDialog();
      } else if (mod && key === "o") {
        e.preventDefault();
        void openWithDialog();
      } else if (mod && key === "b") {
        e.preventDefault();
        toggleExplorer();
      } else if (mod && key === "n") {
        e.preventDefault();
        setDialog("new-file");
      } else if (mod && key === "s") {
        e.preventDefault();
        void saveDoc(undefined, e.shiftKey);
      } else if (mod && e.shiftKey && key === "enter") {
        e.preventDefault();
        void stepActive();
      } else if ((mod && (key === "enter" || key === "r")) || e.key === "F5") {
        e.preventDefault();
        void runActive();
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        setPrefs({ fontSize: Math.min(getState().prefs.fontSize + 1, 40) });
      } else if (mod && key === "-") {
        e.preventDefault();
        setPrefs({ fontSize: Math.max(getState().prefs.fontSize - 1, 8) });
      } else if (mod && key === "0") {
        e.preventDefault();
        setPrefs({ fontSize: 14 });
      }
    };
    // Bubble phase: keys the editors handle themselves never reach here.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const prefs = useApp((s) => s.prefs);
  const explorerVisible = prefs.explorerVisible;
  useGlobalShortcuts();

  useEffect(() => {
    void initialize().then(() => {
      // Quiet check shortly after startup, in release builds only.
      if (!import.meta.env.DEV && getState().prefs.checkForUpdates) {
        setTimeout(() => void checkForUpdates(true), 4000);
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

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(prefs.theme);
    };
    apply();
    document.documentElement.style.fontSize = `${13 * prefs.uiScale}px`;
    document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme, prefs.uiScale, prefs.reducedMotion]);

  return (
    <div className="app">
      <Toolbar />
      <div className="body">
        {explorerVisible && <Explorer />}
        <main className="workspace">
          <EditorArea />
          <BottomPanel />
        </main>
      </div>
      <StatusBar />
      <Dialogs />
      <Notices />
    </div>
  );
}
