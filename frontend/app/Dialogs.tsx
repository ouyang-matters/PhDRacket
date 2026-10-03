import { useEffect, useState, type ReactNode } from "react";
import { checkForUpdates, installUpdate, useUpdate } from "./updates";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { RuntimeInfo } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { NEW_FILE_LANGUAGES } from "@frontend/workspace/new-file";
import { versionMismatch } from "@shared/models/profiles";
import { activeProfile, newFile, selectRuntime, setDialog, setPrefs, useApp } from "./store";
import type { ThemeChoice } from "@frontend/settings/preferences";

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function NewFileDialog() {
  const preferred = useApp((s) => activeProfile(s).defaultLanguage);
  return (
    <Modal title="New file" onClose={() => setDialog(null)}>
      <div className="choice-list">
        {NEW_FILE_LANGUAGES.map((l) => (
          <button key={l.id} autoFocus={l.id === preferred} onClick={() => newFile(l.id)}>
            <strong>{l.name}</strong>
            <span className="muted">{l.short}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RuntimeDialog() {
  const status = useApp((s) => s.runtime);
  const profile = useApp((s) => activeProfile(s));
  const mismatch = versionMismatch(profile, status.runtime?.version);
  const [found, setFound] = useState<RuntimeInfo[] | null>(null);
  useEffect(() => {
    void backend.runtimeDiscover().then(setFound);
  }, []);
  const current = status.runtime?.executable;
  return (
    <Modal title="Racket runtime" onClose={() => setDialog(null)}>
      {status.runtime ? (
        <dl className="kv">
          <dt>Version</dt>
          <dd>
            {status.runtime.version}
            {mismatch && <span className="status-warn"> · {profile.short}: {mismatch}</span>}
          </dd>
          <dt>Executable</dt>
          <dd className="mono">{status.runtime.executable}</dd>
          <dt>Virtual machine</dt>
          <dd>{status.runtime.vm}</dd>
          <dt>HtDP teaching languages</dt>
          <dd>{status.runtime.hasHtdp ? "installed" : "not installed"}</dd>
        </dl>
      ) : (
        <p>{status.state === "detecting" ? "Detecting…" : "No Racket installation in use."}</p>
      )}
      {status.message && <p className="banner warning">{status.message}</p>}
      <h3>Detected installations</h3>
      {found === null ? (
        <p className="muted">Searching…</p>
      ) : found.length === 0 ? (
        <p>None found.</p>
      ) : (
        <ul className="runtime-list">
          {found.map((r) => (
            <li key={r.executable}>
              <span>
                Racket {r.version} <span className="muted mono">{r.executable}</span>
                {!r.hasHtdp && <span className="muted"> (no htdp-lib)</span>}
              </span>
              <button disabled={r.executable === current} onClick={() => void selectRuntime(r.executable)}>
                {r.executable === current ? "In use" : "Use"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button
          onClick={async () => {
            const p = await openDialog({ multiple: false, title: "Choose the racket executable" });
            if (typeof p === "string") await selectRuntime(p);
          }}
        >
          Choose another installation…
        </button>
        <button onClick={() => void selectRuntime(null)}>Detect automatically</button>
      </div>
    </Modal>
  );
}

function UpdateLine() {
  const u = useUpdate();
  const text: Record<string, string> = {
    checking: "Checking for updates…",
    none: "PhDRacket is up to date.",
    error: `Update check failed: ${u.error ?? ""}`,
  };
  return (
    <div className="row">
      {u.status === "available" ? (
        <button className="primary" onClick={() => setDialog("update")}>
          Update to {u.version}
        </button>
      ) : (
        <button onClick={() => void checkForUpdates()} disabled={u.status === "checking"}>
          Check for updates
        </button>
      )}
      <span className="muted small">{text[u.status] ?? ""}</span>
    </div>
  );
}

function UpdateDialog() {
  const u = useUpdate();
  return (
    <Modal title={`PhDRacket ${u.version ?? ""}`} onClose={() => setDialog(null)}>
      {u.notes && <pre className="release-notes">{u.notes}</pre>}
      {u.status === "error" && <p className="status-warn">{u.error}</p>}
      <div className="row">
        <button
          className="primary"
          disabled={u.status === "downloading" || u.status === "ready"}
          onClick={() => void installUpdate()}
        >
          {u.status === "downloading"
            ? `Downloading${u.progress !== null ? ` ${Math.round(u.progress * 100)}%` : "…"}`
            : u.status === "ready"
              ? "Restarting…"
              : "Install and restart"}
        </button>
        <button onClick={() => setDialog(null)}>Later</button>
      </div>
    </Modal>
  );
}

function AboutDialog() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    void backend.appInfo().then((i) => setVersion(i.version));
  }, []);
  return (
    <Modal title="About PhDRacket" onClose={() => setDialog(null)}>
      <p>
        <strong>PhDRacket</strong> {version}
        <br />
        Same Racket. Better IDE.
      </p>
      <UpdateLine />
      <p className="muted small">
        Independent open-source project. Not affiliated with the University of Waterloo or the Racket project.
      </p>
    </Modal>
  );
}

function SettingsDialog() {
  const prefs = useApp((s) => s.prefs);
  return (
    <Modal title="Settings" onClose={() => setDialog(null)}>
      <div className="form">
        <label>
          Theme
          <select value={prefs.theme} onChange={(e) => setPrefs({ theme: e.target.value as ThemeChoice })}>
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </label>
        <label>
          Editor font
          <input value={prefs.fontFamily} onChange={(e) => setPrefs({ fontFamily: e.target.value })} />
        </label>
        <label>
          Font size
          <input type="number" min={8} max={40} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) || 14 })} />
        </label>
        <label>
          Line height
          <input type="number" min={1} max={3} step={0.1} value={prefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: Number(e.target.value) || 1.5 })} />
        </label>
        <label>
          Interface scale
          <input type="number" min={0.75} max={2} step={0.05} value={prefs.uiScale} onChange={(e) => setPrefs({ uiScale: Number(e.target.value) || 1 })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.autoClosingBrackets} onChange={(e) => setPrefs({ autoClosingBrackets: e.target.checked })} />
          Insert closing delimiters automatically
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.rainbowBrackets} onChange={(e) => setPrefs({ rainbowBrackets: e.target.checked })} />
          Rainbow parentheses
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.minimap} onChange={(e) => setPrefs({ minimap: e.target.checked })} />
          Show minimap
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.autosave} onChange={(e) => setPrefs({ autosave: e.target.checked })} />
          Autosave
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.checkForUpdates} onChange={(e) => setPrefs({ checkForUpdates: e.target.checked })} />
          Check for updates on startup
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />
          Reduce motion
        </label>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  switch (dialog) {
    case "new-file":
      return <NewFileDialog />;
    case "runtime":
      return <RuntimeDialog />;
    case "about":
      return <AboutDialog />;
    case "settings":
      return <SettingsDialog />;
    case "update":
      return <UpdateDialog />;
    default:
      return null;
  }
}
