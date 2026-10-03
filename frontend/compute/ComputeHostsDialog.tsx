// Configure Remote Hosts: name, SSH destination and Racket command, with a
// connection check. No passwords: hosts must allow non-interactive SSH login
// with the user's own keys.

import { useState } from "react";
import { Modal } from "@frontend/app/Modal";
import { setDialog, useApp } from "@frontend/app/store";
import type { ComputeHost } from "@frontend/settings/preferences";
import { checkHost, newHostId, saveHosts, useCompute } from "./compute";

const HOST_PATTERN = /^[A-Za-z0-9@._:\[\]-]+$/;
const RACKET_PATTERN = /^[A-Za-z0-9/._+~-]+$/;

function valid(h: ComputeHost): string | null {
  if (!h.name.trim()) return "Name is required.";
  if (!HOST_PATTERN.test(h.host) || h.host.startsWith("-")) return "Use a host name, user@host or an SSH alias.";
  if (!RACKET_PATTERN.test(h.racket)) return "Use a command or path without spaces or shell syntax.";
  return null;
}

export function ComputeHostsDialog() {
  const saved = useApp((s) => s.prefs.computeHosts);
  const [hosts, setHosts] = useState<ComputeHost[]>(saved);
  const connections = useCompute((c) => c.connections);
  const close = () => setDialog(null);
  const update = (id: string, patch: Partial<ComputeHost>) => setHosts((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const errors = hosts.map(valid);

  return (
    <Modal title="Remote Hosts" onClose={close}>
      <p className="muted small">
        Programs run over SSH with your own SSH keys; PhDRacket never asks for passwords. Connect to a new host once with
        <code> ssh </code>
        in a terminal to verify its key. Run always uses this computer; Run Remotely uses the selected host.
      </p>
      {hosts.length === 0 && <p className="muted">No remote hosts.</p>}
      {hosts.map((h, i) => {
        const c = connections[h.id];
        return (
          <fieldset key={h.id} className="host-card">
            <div className="form">
              <label>
                Name
                <input value={h.name} placeholder="DGX" onChange={(e) => update(h.id, { name: e.target.value })} />
              </label>
              <label>
                SSH destination
                <input value={h.host} placeholder="user@host" onChange={(e) => update(h.id, { host: e.target.value.trim() })} />
              </label>
              <label>
                Racket command
                <input value={h.racket} onChange={(e) => update(h.id, { racket: e.target.value.trim() })} />
              </label>
            </div>
            {errors[i] && <p className="status-warn small">{errors[i]}</p>}
            <div className="row">
              <button disabled={!!errors[i] || c?.state === "checking"} onClick={() => void checkHost(h)}>
                Test Connection
              </button>
              <span className={`small ${c?.state === "offline" ? "status-warn" : "muted"}`}>
                {c?.state === "checking" ? "Checking…" : c?.state === "connected" ? c.detail : c?.state === "offline" ? c.detail : ""}
              </span>
              <span className="toolbar-spacer" />
              <button onClick={() => setHosts((hs) => hs.filter((x) => x.id !== h.id))}>Remove</button>
            </div>
          </fieldset>
        );
      })}
      <div className="row end">
        <button onClick={() => setHosts((hs) => [...hs, { id: newHostId(), name: "", host: "", racket: "racket" }])}>Add Host</button>
        <span className="toolbar-spacer" />
        <button onClick={close}>Cancel</button>
        <button
          className="primary"
          disabled={errors.some(Boolean)}
          onClick={() => {
            saveHosts(hosts);
            close();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
