// Registers remote compute's commands, menus and Tasks panel.

import { activeDoc, getState, setDialog, setPanel } from "@frontend/app/store";
import { registerCommands } from "@frontend/commands/registry";
import { registerMenuItems, registerMenuProvider } from "@frontend/commands/menus";
import { registerPanelView } from "@frontend/workbench/panels";
import { quickPick } from "@frontend/workbench/QuickInput";
import { Icon } from "@frontend/workbench/icons";
import { computeHosts, connectionOf, currentTarget, runRemotely, selectTarget, startCompute } from "./compute";
import { TasksPanel } from "./TasksPanel";

function pickTarget() {
  const hosts = computeHosts();
  quickPick({
    placeholder: "Select a compute target",
    activeId: getState().prefs.computeTarget,
    items: [
      { id: "local", label: "Local", description: "this computer", icon: <Icon name="local" size={14} /> },
      ...hosts.map((h) => {
        const c = connectionOf(h.id).state;
        return { id: h.id, label: h.name, description: `${h.host}${c === "connected" ? " · connected" : c === "offline" ? " · offline" : ""}`, icon: <Icon name="remote" size={14} /> };
      }),
      { id: "__configure", label: "Configure Remote Hosts…", icon: <Icon name="settings" size={14} /> },
    ],
    onAccept: (item) => (item.id === "__configure" ? setDialog("compute-hosts") : selectTarget(item.id)),
  });
}

let installed = false;

export function installCompute() {
  if (installed) return;
  installed = true;
  registerCommands([
    { id: "compute.selectTarget", title: "Select Compute Target…", category: "Remote Compute", icon: "remote", run: pickTarget },
    { id: "compute.useLocal", title: "Use Local Compute", category: "Remote Compute", icon: "local", checked: () => currentTarget() === null, run: () => selectTarget("local") },
    { id: "compute.configureHosts", title: "Configure Remote Hosts…", category: "Remote Compute", run: () => setDialog("compute-hosts") },
    { id: "compute.connect", title: "Connect Remote Host", category: "Remote Compute", run: pickTarget },
    { id: "compute.useHost", title: "Use Remote Host", category: "Remote Compute", palette: false, run: (id) => typeof id === "string" && selectTarget(id) },
    { id: "compute.tasks", title: "Remote Task Manager", category: "Remote Compute", run: () => setPanel("tasks") },
    {
      id: "run.runRemotely",
      title: "Run Remotely",
      category: "Run",
      icon: "remote",
      enabled: () => !!activeDoc() && currentTarget() !== null,
      run: runRemotely,
    },
  ]);
  registerMenuItems("menubar.tools", [{ submenu: "menubar.tools.compute", title: "Remote Compute", group: "3_compute" }]);
  registerMenuItems("menubar.tools.compute", [
    { command: "compute.useLocal", group: "1", order: 1 },
    { command: "compute.configureHosts", group: "3", order: 1 },
    { command: "compute.tasks", group: "3", order: 2 },
  ]);
  registerMenuProvider("menubar.tools.compute", () =>
    computeHosts().map((h, i) => ({ command: "compute.useHost", args: h.id, title: h.name, group: "2", order: i })),
  );
  registerMenuItems("menubar.run", [{ command: "run.runRemotely", group: "1_run", order: 3, when: () => computeHosts().length > 0 }]);
  registerPanelView({
    id: "tasks",
    title: "Tasks",
    icon: "remote",
    order: 60,
    visible: () => computeHosts().length > 0 || getState().panel === "tasks",
    render: () => <TasksPanel />,
  });
  void startCompute();
}
