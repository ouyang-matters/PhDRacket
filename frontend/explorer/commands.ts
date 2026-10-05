// Explorer commands and its context menu. Commands take the entry they act
// on as their argument (from the context menu); without one they act on the
// selection, or on the open folder.

import { getState, setPrefs } from "@frontend/app/store";
import { registerCommands } from "@frontend/commands/registry";
import { registerMenuItems, type MenuItem } from "@frontend/commands/menus";
import * as A from "./actions";
import { explorerState, reloadFolders, type Target } from "./state";

export const EXPLORER_MENU = "explorer.context";

/** The entry the open context menu is for (null: the folder's empty space). */
let menuTarget: Target | null = null;

export function setMenuTarget(t: Target | null) {
  menuTarget = t;
}

const target = (args: unknown): Target | null => (args && typeof args === "object" && "path" in args ? (args as Target) : explorerState().selected);
const hasFolder = () => !!getState().folder;

export function installExplorerCommands() {
  registerCommands([
    { id: "explorer.newFile", title: "New File in Explorer…", category: "Explorer", icon: "newFile", enabled: hasFolder, run: (a) => A.startNew("new-file", target(a)) },
    { id: "explorer.newFolder", title: "New Folder…", category: "Explorer", icon: "newFolder", enabled: hasFolder, run: (a) => A.startNew("new-folder", target(a)) },
    { id: "explorer.open", title: "Open", category: "Explorer", palette: false, run: (a) => A.open(target(a)) },
    { id: "explorer.rename", title: "Rename…", category: "Explorer", palette: false, run: (a) => A.startRename(target(a)) },
    { id: "explorer.duplicate", title: "Duplicate", category: "Explorer", palette: false, run: (a) => void A.duplicate(target(a)) },
    { id: "explorer.cut", title: "Cut", category: "Explorer", palette: false, run: (a) => A.copy(target(a), "cut") },
    { id: "explorer.copy", title: "Copy", category: "Explorer", palette: false, run: (a) => A.copy(target(a), "copy") },
    {
      id: "explorer.paste",
      title: "Paste",
      category: "Explorer",
      palette: false,
      enabled: () => !!explorerState().clipboard,
      run: (a) => void A.paste(target(a)),
    },
    { id: "explorer.delete", title: "Delete (Move to Recycle Bin)", category: "Explorer", palette: false, run: (a) => A.remove(target(a)) },
    { id: "explorer.copyPath", title: "Copy Path", category: "Explorer", palette: false, run: (a) => A.copyPath(target(a) ?? rootTarget(), false) },
    { id: "explorer.copyRelativePath", title: "Copy Relative Path", category: "Explorer", palette: false, run: (a) => A.copyPath(target(a), true) },
    { id: "explorer.reveal", title: "Reveal in File Explorer", category: "Explorer", palette: false, run: (a) => A.reveal(target(a) ?? rootTarget()) },
    { id: "explorer.properties", title: "Properties", category: "Explorer", palette: false, run: (a) => A.showProperties(target(a) ?? rootTarget()) },
    { id: "explorer.refresh", title: "Refresh Explorer", category: "Explorer", icon: "restart", enabled: hasFolder, run: () => reloadFolders() },
    { id: "explorer.collapseAll", title: "Collapse Folders in Explorer", category: "Explorer", icon: "collapse", enabled: hasFolder, run: () => A.collapseAll() },
    {
      id: "explorer.toggleHidden",
      title: "Show Hidden Files in Explorer",
      category: "Explorer",
      checked: () => getState().prefs.showHiddenFiles,
      run: () => setPrefs({ showHiddenFiles: !getState().prefs.showHiddenFiles }),
    },
  ]);

  const onFile = () => !!menuTarget && !menuTarget.isDir;
  const onEntry = () => !!menuTarget;
  const item = (command: string, group: string, order: number, when?: () => boolean): MenuItem => ({ command, group, order, when });
  registerMenuItems(EXPLORER_MENU, [
    item("explorer.open", "1_open", 1, onFile),
    item("explorer.newFile", "2_new", 1),
    item("explorer.newFolder", "2_new", 2),
    item("explorer.cut", "3_clip", 1, onEntry),
    item("explorer.copy", "3_clip", 2, onEntry),
    item("explorer.paste", "3_clip", 3),
    item("explorer.duplicate", "3_clip", 4, onEntry),
    item("explorer.copyPath", "4_path", 1),
    item("explorer.copyRelativePath", "4_path", 2, onEntry),
    item("explorer.reveal", "4_path", 3),
    item("explorer.rename", "5_edit", 1, onEntry),
    item("explorer.delete", "5_edit", 2, onEntry),
    item("explorer.properties", "6_props", 1),
  ]);
}

function rootTarget(): Target | null {
  const f = getState().folder;
  return f ? { path: f, isDir: true } : null;
}
