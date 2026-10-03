// Pickers built on the quick input. The command palette lists the same
// registry the menus use.

import { activeDoc, activeProfile, changeLanguage, getState, openPath, setPrefs } from "@frontend/app/store";
import { allCommands, commandLabel, executeCommand, isEnabled, isVisible } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { backend } from "@frontend/ipc/backend";
import { NEW_FILE_LANGUAGES } from "@frontend/workspace/new-file";
import { currentLanguageId } from "@frontend/workspace/change-language";
import { PROFILES } from "@shared/models/profiles";
import { applyTheme } from "@frontend/theme/apply";
import { resolveThemeChoice } from "@frontend/theme/engine";
import { THEMES } from "@frontend/theme/themes";
import { quickPick, type QuickItem } from "./QuickInput";
import { Icon } from "./icons";

/** Recently run commands, most recent first. */
const recentCommands: string[] = [];

export function showCommandPalette(initial = "") {
  const commands = allCommands().filter((c) => c.palette !== false && isVisible(c) && isEnabled(c));
  const rank = (id: string) => {
    const i = recentCommands.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const items: QuickItem[] = commands
    .sort((a, b) => rank(a.id) - rank(b.id) || commandLabel(a).localeCompare(commandLabel(b)))
    .map((c) => {
      const key = keybindingFor(c.id);
      return {
        id: c.id,
        label: commandLabel(c),
        description: rank(c.id) < Number.MAX_SAFE_INTEGER ? "recently used" : undefined,
        detail: key ? formatKey(key) : undefined,
      };
    });
  quickPick({
    placeholder: "Type the name of a command",
    items,
    initialValue: initial,
    onValue: (v) => {
      // ":" switches to Go to Line, as in other editors.
      if (v.startsWith(":")) {
        executeCommand("go.line");
        return true;
      }
      return false;
    },
    onAccept: (item) => {
      const at = recentCommands.indexOf(item.id);
      if (at >= 0) recentCommands.splice(at, 1);
      recentCommands.unshift(item.id);
      if (recentCommands.length > 10) recentCommands.pop();
      executeCommand(item.id);
    },
  });
}

function relative(path: string, root: string | null): string {
  if (!root) return path;
  const p = path.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  return p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : path;
}

function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Quick Open: files in the open folder, open editors and recent files. */
export function showQuickOpen() {
  const s = getState();
  const folder = s.folder;
  quickPick({
    placeholder: folder ? "Search files by name (type > for commands)" : "Search open and recent files (type > for commands)",
    items: async () => {
      const seen = new Set<string>();
      const items: QuickItem[] = [];
      const add = (path: string, description: string) => {
        const key = path.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ id: path, label: baseName(path), description, icon: <Icon name="explorer" size={14} /> });
      };
      for (const d of s.docs) if (d.path) add(d.path, relative(d.path, folder));
      for (const p of s.recentFiles) add(p, relative(p, folder));
      if (folder) {
        try {
          for (const p of await backend.workspaceFiles(folder)) add(p, relative(p, folder));
        } catch {
          // An unreadable folder still leaves open and recent files.
        }
      }
      return items;
    },
    onValue: (v) => {
      if (v.startsWith(">")) {
        showCommandPalette(v.slice(1));
        return true;
      }
      return false;
    },
    onAccept: (item) => void openPath(item.id),
    empty: "No matching files",
  });
}

/** Preferences: Color Theme. Highlighting previews; Escape restores. */
export function showThemePicker() {
  const before = getState().prefs.theme;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const items: QuickItem[] = [
    { id: "system", label: "Follow System", description: dark ? "currently dark" : "currently light" },
    ...THEMES.map((t) => ({ id: t.id, label: t.name, description: t.description })),
  ];
  quickPick({
    placeholder: "Select Color Theme (Up/Down to preview)",
    items,
    activeId: before,
    onHighlight: (item) => item && applyTheme(resolveThemeChoice(item.id, dark)),
    onCancel: () => applyTheme(resolveThemeChoice(before, dark)),
    onAccept: (item) => setPrefs({ theme: item.id }),
  });
}

export function showLanguagePicker() {
  const doc = activeDoc();
  if (!doc) return;
  quickPick({
    placeholder: "Select the language of this file",
    items: NEW_FILE_LANGUAGES.map((l) => ({ id: l.id, label: l.name, description: l.short })),
    activeId: currentLanguageId(doc.model.getValue()) ?? undefined,
    onAccept: (item) => changeLanguage(item.id),
  });
}

export function showProfilePicker() {
  quickPick({
    placeholder: "Select a course profile",
    items: PROFILES.map((p) => ({ id: p.id, label: p.name, description: p.short })),
    activeId: activeProfile().id,
    onAccept: (item) => setPrefs({ profile: item.id }),
  });
}
