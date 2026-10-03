// Keyboard Shortcuts (a page of Settings): every command and its key. Click a
// key to record a new one; changes are stored as overrides in the preferences.

import { useMemo, useState } from "react";
import { setPrefs, useApp } from "@frontend/app/store";
import { allCommands, commandLabel, isVisible, useCommandsVersion } from "@frontend/commands/registry";
import { conflicts, defaultKeybinding, eventKey, formatKey, keybindingFor, normalizeKey } from "@frontend/commands/keybindings";
import { filterItems } from "./QuickInput";

export function KeybindingsEditor() {
  useCommandsVersion();
  const overrides = useApp((s) => s.prefs.keybindings);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const commands = allCommands().filter((c) => isVisible(c) && c.palette !== false);
  const clashes = useMemo(() => new Map(conflicts().flatMap(([key, ids]) => ids.map((id) => [id, key] as const))), [overrides]);
  const items = filterItems(
    commands.map((c) => ({ id: c.id, label: commandLabel(c), description: c.id })),
    query,
  ).sort((a, b) => (query ? 0 : a.label.localeCompare(b.label)));

  const setKey = (id: string, key: string | null) => {
    const next = { ...overrides };
    if (key === null) delete next[id];
    else next[id] = key;
    setPrefs({ keybindings: next });
  };

  return (
    <div className="keybindings-editor">
      <input className="keybinding-search" autoFocus placeholder="Search commands" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search commands" />
      <table className="keybindings">
        <thead>
          <tr>
            <th>Command</th>
            <th>Keybinding</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const c = commands.find((x) => x.id === item.id)!;
            const key = keybindingFor(c.id);
            const changed = c.id in overrides;
            const native = c.nativeKey && !changed;
            return (
              <tr key={c.id} className={changed ? "changed" : undefined}>
                <td title={c.id}>{item.label}</td>
                <td>
                  {recording === c.id ? (
                    <input
                      className="key-recorder"
                      autoFocus
                      readOnly
                      value="Press a key combination…"
                      onBlur={() => setRecording(null)}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.key === "Escape") return setRecording(null);
                        const k = eventKey(e.nativeEvent);
                        if (!k) return;
                        setKey(c.id, normalizeKey(k));
                        setRecording(null);
                      }}
                    />
                  ) : (
                    <button className="key-button" disabled={native} title={native ? "Handled by the editor" : "Change keybinding"} onClick={() => setRecording(c.id)}>
                      {key ? <kbd>{formatKey(key)}</kbd> : <span className="muted">—</span>}
                    </button>
                  )}
                  {clashes.has(c.id) && <span className="status-warn small"> conflict</span>}
                </td>
                <td>
                  {changed && (
                    <button className="link" title={`Default: ${formatKey(defaultKeybinding(c) ?? "") || "none"}`} onClick={() => setKey(c.id, null)}>
                      Reset
                    </button>
                  )}
                  {!changed && key && !native && (
                    <button className="link" onClick={() => setKey(c.id, "")}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
