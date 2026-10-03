import { useEffect, useState } from "react";
import { checkForUpdates, installUpdate, useUpdate } from "./updates";
import { SetupDialog } from "./Setup";
import { Modal } from "./Modal";
import { TermsView } from "@frontend/legal/TermsView";
import { TERMS_VERSION } from "@frontend/legal/terms";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { RuntimeInfo } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { NEW_FILE_LANGUAGES } from "@frontend/workspace/new-file";
import { versionMismatch } from "@shared/models/profiles";
import { activeProfile, answerUnsaved, dismissAnnouncement, newFile, selectRuntime, setDialog, useApp } from "./store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BrandMark } from "@frontend/workbench/BrandMark";
import { Icon } from "@frontend/workbench/icons";
import { SettingsDialog } from "@frontend/settings/SettingsDialog";
import { RELEASE_CHANNEL } from "./release";
import { ComputeHostsDialog } from "@frontend/compute/ComputeHostsDialog";

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

function AnnouncementDialog() {
  const a = useApp((s) => s.announcements[0]);
  if (!a) return null;
  return (
    <Modal title={a.title} onClose={dismissAnnouncement}>
      <p className="announcement-body">{a.body}</p>
      <div className="row end">
        {a.link && (
          <button onClick={() => void openUrl(a.link!.url)} title={a.link.url}>
            {a.link.label}
          </button>
        )}
        <button className="primary" autoFocus onClick={dismissAnnouncement}>
          OK
        </button>
      </div>
    </Modal>
  );
}

function TermsDialog() {
  return (
    <Modal title="Beta Terms of Use" onClose={() => setDialog(null)}>
      <p className="muted small">Last Updated: {TERMS_VERSION}</p>
      <TermsView />
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
      <div className="about-head">
        <BrandMark size={56} />
        <p>
          <strong>PhDRacket</strong> {version} {RELEASE_CHANNEL}
          <br />
          Same Racket. Better IDE.
        </p>
      </div>
      <UpdateLine />
      <p className="muted small">
        Independent open-source project. Not affiliated with the University of Waterloo or the Racket project.
      </p>
      <p className="small">
        <button className="link" onClick={() => setDialog("terms")}>
          Beta Terms of Use
        </button>
        <span className="muted"> · support@aqouyang.com</span>
      </p>
    </Modal>
  );
}

/** Closing or quitting with unsaved files: Save, Don't Save or Cancel. */
function UnsavedDialog() {
  const prompt = useApp((s) => s.unsaved);
  if (!prompt) return null;
  const one = prompt.names.length === 1;
  const title = one ? `Save changes to ${prompt.names[0]}?` : `Save changes to ${prompt.names.length} files?`;
  return (
    <Modal title={title} className="unsaved-modal" onClose={() => answerUnsaved("cancel")}>
      <div className="unsaved">
        <span className="unsaved-icon" aria-hidden>
          <Icon name="save" size={22} />
        </span>
        <div>
          <p>
            {one ? "This file has changes that are not saved." : "These files have changes that are not saved:"}
          </p>
          {!one && (
            <ul className="unsaved-files">
              {prompt.names.map((n, i) => (
                <li key={`${n}-${i}`}>{n}</li>
              ))}
            </ul>
          )}
          <p className="muted small">If you don't save, your changes will be lost.</p>
        </div>
      </div>
      <div className="row end unsaved-actions">
        <button onClick={() => answerUnsaved("discard")}>{prompt.kind === "quit" ? "Quit Without Saving" : "Don't Save"}</button>
        <span className="toolbar-spacer" />
        <button onClick={() => answerUnsaved("cancel")}>Cancel</button>
        <button className="primary" autoFocus onClick={() => answerUnsaved("save")}>
          {one ? "Save" : "Save All"}
        </button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const unsaved = useApp((s) => s.unsaved !== null);
  if (unsaved) return <UnsavedDialog />;
  return <DialogSwitch />;
}

function DialogSwitch() {
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
    case "setup":
      return <SetupDialog />;
    case "announcement":
      return <AnnouncementDialog />;
    case "terms":
      return <TermsDialog />;
    case "compute-hosts":
      return <ComputeHostsDialog />;
    default:
      return null;
  }
}
