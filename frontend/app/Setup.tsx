// First-run setup: choose a profile and get a working Racket with as few
// decisions as possible. Every choice has a default; "Finish" accepts them.

import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { InstallPlan, InstallProgress } from "@shared/protocol";
import { PROFILES, profileById } from "@shared/models/profiles";
import { backend } from "@frontend/ipc/backend";
import { exit } from "@tauri-apps/plugin-process";
import { TERMS_VERSION } from "@frontend/legal/terms";
import { TermsView } from "@frontend/legal/TermsView";
import { Modal } from "./Modal";
import { selectRuntime, setDialog, setPrefs, useApp } from "./store";

type RacketChoice = "install" | "existing";

/** The first-run theme choices; every theme is available later in Settings. */
const SETUP_THEMES: [string, string][] = [
  ["system", "Follow system"],
  ["phd-light", "Light"],
  ["phd-dark", "Dark"],
  ["waterloo-math-pink", "Waterloo Math Pink (unofficial)"],
  ["waterloo-black-gold", "Waterloo Black & Gold (unofficial)"],
];

function progressText(p: InstallProgress | null): string {
  if (!p) return "Starting…";
  switch (p.phase) {
    case "downloading": {
      const mb = (n: number) => Math.round(n / 1e6);
      return p.total ? `Downloading ${mb(p.received)} of ${mb(p.total)} MB` : `Downloading ${mb(p.received)} MB`;
    }
    case "verifying":
      return "Verifying the download";
    case "installing":
      return "Installing";
    case "checking":
      return "Checking the installation";
  }
}

export function SetupDialog() {
  const prefs = useApp((s) => s.prefs);
  const runtime = useApp((s) => s.runtime);
  const profile = profileById(prefs.profile);
  const version = profile.expectedRacketVersion ?? "9.3";

  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [dest, setDest] = useState<string>("");
  const [choice, setChoice] = useState<RacketChoice>("install");
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(prefs.termsAccepted === TERMS_VERSION);

  useEffect(() => {
    void backend.installPlan(version).then((p) => {
      setPlan(p);
      setDest(p.defaultDir ?? "");
    });
  }, [version]);

  useEffect(() => {
    const off = backend.onInstallEvent((e) => {
      if (e.phase === "progress") setProgress(e.progress);
      else if (e.phase === "failed") {
        setInstalling(false);
        setError(e.message);
      } else {
        setInstalling(false);
        finish();
      }
    });
    return () => void off.then((f) => f());
  }, []);

  const rt = runtime.runtime;
  const ready = runtime.state === "ready" && !!rt?.hasHtdp;
  const matches = ready && (!profile.expectedRacketVersion || rt?.version === profile.expectedRacketVersion);
  const canInstall = !!plan?.installer;

  function finish() {
    setPrefs({ setupDone: true, termsAccepted: TERMS_VERSION });
    setDialog(null);
  }

  async function start() {
    setError(null);
    if (matches || (ready && choice === "existing")) return finish();
    if (choice === "existing") {
      const exe = await openDialog({ multiple: false, title: "Choose the racket executable" });
      if (typeof exe === "string") {
        await selectRuntime(exe);
        finish();
      }
      return;
    }
    if (!plan?.installer || !dest) return;
    setInstalling(true);
    setProgress(null);
    await backend.installRacket(plan.version, dest);
  }

  const percent =
    progress?.phase === "downloading" && progress.total ? Math.round((progress.received / progress.total) * 100) : null;

  return (
    <Modal title="Set up PhDRacket" onClose={() => agreed && !installing && finish()} dismissable={agreed && !installing}>
      <div className="setup">
        <section>
          <h3>Beta Terms of Use</h3>
          <TermsView className="terms-box" />
          <label className="check terms-check">
            <input type="checkbox" checked={agreed} disabled={installing} onChange={(e) => setAgreed(e.target.checked)} />
            I have read and agree to the PhDRacket Beta Terms of Use
          </label>
        </section>

        <section>
          <h3>Course</h3>
          <select
            value={prefs.profile}
            disabled={installing}
            onChange={(e) => setPrefs({ profile: e.target.value })}
            aria-label="Course"
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h3>Racket</h3>
          {runtime.state === "detecting" ? (
            <p className="muted">Looking for Racket…</p>
          ) : matches ? (
            <p>
              Racket {rt!.version} <span className="muted mono small">{rt!.executable}</span>
            </p>
          ) : (
            <>
              {ready && (
                <p className="muted small">
                  Found Racket {rt!.version}. {profile.short} uses Racket {version}.
                </p>
              )}
              <label className="radio">
                <input
                  type="radio"
                  name="racket"
                  checked={choice === "install"}
                  disabled={installing || !canInstall}
                  onChange={() => setChoice("install")}
                />
                <span>
                  Install Racket {version}
                  {plan?.installer && <span className="muted"> ({Math.round(plan.installer.sizeMb)} MB download)</span>}
                </span>
              </label>
              {choice === "install" && canInstall && (
                <div className="indent">
                  <div className="path-row">
                    <span className="mono small" title={dest}>
                      {dest}
                    </span>
                    <button
                      className="small-btn"
                      disabled={installing}
                      onClick={async () => {
                        const d = await openDialog({ directory: true, title: "Install Racket in" });
                        if (typeof d === "string") setDest(d);
                      }}
                    >
                      Change…
                    </button>
                  </div>
                  {plan?.needsAdmin && <p className="muted small">Windows asks for permission once.</p>}
                </div>
              )}
              <label className="radio">
                <input
                  type="radio"
                  name="racket"
                  checked={choice === "existing"}
                  disabled={installing}
                  onChange={() => setChoice("existing")}
                />
                <span>{ready ? `Keep Racket ${rt!.version}` : "Use an existing installation…"}</span>
              </label>
              {!canInstall && plan && <p className="muted small">Automatic installation is not available on this system.</p>}
            </>
          )}
          {installing && (
            <div className="install-progress" role="status">
              <div className="bar">
                <div className={`fill${percent === null ? " indeterminate" : ""}`} style={{ width: `${percent ?? 100}%` }} />
              </div>
              <span className="small">{progressText(progress)}</span>
            </div>
          )}
          {error && <p className="status-warn small">{error}</p>}
        </section>

        <section>
          <h3>Theme</h3>
          <div className="theme-choices" role="radiogroup" aria-label="Theme">
            {SETUP_THEMES.map(([id, label]) => (
              <label key={id} className="radio">
                <input type="radio" name="theme" checked={prefs.theme === id} disabled={installing} onChange={() => setPrefs({ theme: id })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <div className="row end">
          <button disabled={installing} onClick={() => void exit(0)}>
            Quit
          </button>
          <button
            className="primary"
            disabled={!agreed || installing || runtime.state === "detecting"}
            onClick={() => void start()}
          >
            {matches || (ready && choice === "existing")
              ? "Finish"
              : choice === "install"
                ? error
                  ? "Retry"
                  : `Install Racket ${version}`
                : "Choose…"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
