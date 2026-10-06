// Source control commands, the branch picker and the view's registration.

import { createElement } from "react";
import { activeDoc, getState, notify } from "@frontend/app/store";
import { registerCommands } from "@frontend/commands/registry";
import { registerMenuItems } from "@frontend/commands/menus";
import { registerSidebarView, toggleSidebarView } from "@frontend/workbench/sidebar";
import { quickPick } from "@frontend/workbench/QuickInput";
import { backend } from "@frontend/ipc/backend";
import * as G from "./git";
import { SourceControlView } from "./SourceControlView";

export async function showBranchPicker() {
  const dir = getState().folder;
  if (!dir || !G.gitState().status) return;
  quickPick({
    placeholder: "Switch to a branch",
    items: async () => {
      const branches = await backend.gitBranches(dir).catch(() => []);
      return branches
        .filter((b) => !b.remote || !branches.some((l) => !l.remote && b.name.endsWith(`/${l.name}`)))
        .map((b) => ({ id: b.name, label: b.name, description: b.current ? "current" : b.remote ? "remote" : b.upstream ? `→ ${b.upstream}` : undefined }));
    },
    onAccept: (item) => {
      if (item.description === "current") return;
      const local = item.description === "remote" ? item.id.replace(/^[^/]+\//, "") : item.id;
      void G.switchBranch(local);
    },
    empty: "No branches yet: commit first.",
  });
}

const inRepo = () => getState().prefs.git && !!G.gitState().status;

export function installGitCommands() {
  registerCommands([
    { id: "view.sourceControl", title: "Source Control", category: "View", icon: "git", keybinding: "Mod+Shift+G", run: () => toggleSidebarView("scm") },
    { id: "git.refresh", title: "Refresh Source Control", category: "Git", enabled: () => getState().prefs.git, run: () => G.refresh(0) },
    { id: "git.init", title: "Initialize Repository", category: "Git", enabled: () => getState().prefs.git && !!getState().folder && !G.gitState().status, run: () => void G.init() },
    {
      id: "git.openChanges",
      title: "Open Changes (compare with the last commit)",
      category: "Git",
      icon: "diff",
      enabled: () => inRepo() && !!activeDoc()?.path,
      run: () => void G.openChanges(activeDoc()!.path!),
    },
    { id: "git.stageFile", title: "Stage This File", category: "Git", enabled: () => inRepo() && !!activeDoc()?.path, run: () => void G.stage([activeDoc()!.path!]) },
    { id: "git.switchBranch", title: "Switch Branch…", category: "Git", enabled: inRepo, run: () => void showBranchPicker() },
    { id: "git.fetch", title: "Fetch", category: "Git", enabled: inRepo, run: () => void G.sync("fetch") },
    { id: "git.pull", title: "Pull", category: "Git", enabled: inRepo, run: () => void G.sync("pull") },
    { id: "git.push", title: "Push", category: "Git", enabled: inRepo, run: () => void G.sync("push") },
    {
      id: "git.commit",
      title: "Commit…",
      category: "Git",
      enabled: inRepo,
      run: () => {
        toggleSidebarView("scm");
        window.setTimeout(() => (document.querySelector(".scm-commit-box textarea") as HTMLTextAreaElement | null)?.focus(), 50);
        if (!G.gitState().status?.files.length) notify("info", "There are no changes to commit.");
      },
    },
  ]);
  registerMenuItems("menubar.view", [{ command: "view.sourceControl", group: "2_views", order: 3 }]);
  registerMenuItems("menubar.tools", [
    { command: "git.commit", group: "3_git", order: 1 },
    { command: "git.openChanges", group: "3_git", order: 2 },
    { command: "git.switchBranch", group: "3_git", order: 3 },
    { command: "git.pull", group: "3_git", order: 4 },
    { command: "git.push", group: "3_git", order: 5 },
  ]);
  registerMenuItems("editor.tabContext", [{ command: "git.openChanges", group: "4_git", order: 1 }]);
  registerSidebarView({ id: "scm", title: "Source Control", icon: "git", order: 30, command: "view.sourceControl", render: () => createElement(SourceControlView) });
  G.installGit();
}
