// Registers PhDRacket's built-in sidebar views and bottom panels with the
// view frameworks. Optional features register theirs the same way.

import { getState } from "@frontend/app/store";
import { Explorer } from "@frontend/explorer/Explorer";
import { SearchView } from "@frontend/search/SearchView";
import { InteractionsPanel } from "@frontend/interactions/InteractionsPanel";
import { OutputPanel } from "@frontend/problems/OutputPanel";
import { ProblemsPanel } from "@frontend/problems/ProblemsPanel";
import { StepperPanel } from "@frontend/stepper/StepperPanel";
import { TestsPanel } from "@frontend/tests/TestsPanel";
import { registerPanelView } from "./panels";
import { registerSidebarView } from "./sidebar";

let installed = false;

export function installBuiltinViews() {
  if (installed) return;
  installed = true;
  registerSidebarView({ id: "explorer", title: "Explorer", icon: "explorer", order: 10, command: "view.explorer", render: () => <Explorer /> });
  registerSidebarView({ id: "search", title: "Search", icon: "search", order: 20, command: "edit.findInFiles", render: () => <SearchView /> });

  registerPanelView({
    id: "problems",
    title: "Problems",
    icon: "problems",
    order: 10,
    render: () => <ProblemsPanel />,
    badge: () => ({ count: getState().run.diagnostics.filter((d) => d.category !== "test").length }),
  });
  registerPanelView({
    id: "tests",
    title: "Tests",
    icon: "tests",
    order: 20,
    render: () => <TestsPanel />,
    badge: () => ({ count: getState().run.tests?.failed ?? 0, tone: "fail" }),
  });
  // Interactions stays mounted so its input editor and history persist.
  registerPanelView({ id: "interactions", title: "Interactions", icon: "interactions", order: 30, keepMounted: true, render: () => <InteractionsPanel /> });
  registerPanelView({ id: "stepper", title: "Stepper", icon: "stepper", order: 40, render: () => <StepperPanel /> });
  registerPanelView({ id: "output", title: "Output", icon: "output", order: 50, render: () => <OutputPanel /> });
}
