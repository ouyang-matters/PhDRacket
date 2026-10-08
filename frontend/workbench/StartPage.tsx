// Shown when nothing is open: open a file or folder, or pick a recent file.

import { openPath, setFolder, useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { BrandMark } from "./BrandMark";
import { Icon, type IconName } from "./icons";

function Action({ command, icon, label }: { command: string; icon: IconName; label: string }) {
  const key = keybindingFor(command);
  return (
    <button className="start-action" onClick={() => executeCommand(command)}>
      <Icon name={icon} />
      <span>{label}</span>
      {key && <kbd>{formatKey(key)}</kbd>}
    </button>
  );
}

function baseName(p: string) {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;
}

export function StartPage() {
  const recent = useApp((s) => s.recentFiles);
  const folder = useApp((s) => s.folder);
  return (
    <div className="start-page">
      <div className="start-content">
        <div className="start-title">
          <BrandMark size={44} />
          <div>
            <h1>PhDRacket</h1>
            <p className="muted">Modern Racket development environment</p>
          </div>
        </div>
        <div className="start-actions">
          <Action command="file.newFile" icon="newFile" label="New File…" />
          <Action command="file.openFile" icon="openFile" label="Open File…" />
          <Action command="file.openFolder" icon="folder" label="Open Folder…" />
          <Action command="view.openBrowser" icon="globe" label="Open Web Page…" />
        </div>
        {(recent.length > 0 || folder) && (
          <section className="start-recent">
            <h2>Recent</h2>
            <ul>
              {folder && (
                <li>
                  <button className="link" title={folder} onClick={() => setFolder(folder)}>
                    <Icon name="folder" size={14} /> {baseName(folder)}/
                  </button>
                </li>
              )}
              {recent.slice(0, 8).map((p) => (
                <li key={p}>
                  <button className="link" title={p} onClick={() => void openPath(p)}>
                    {baseName(p)}
                    <span className="muted"> {p}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
