// Debug commands, menus and the Debug panel. Keys follow common IDEs: F9
// breakpoint, F6 Debug (and Pause while running), F5 Continue while paused
// (Run otherwise), F10 Step Over, F11 Step Into, Shift+F11 Step Out, Shift+F5
// Stop. Registered before the built-in commands, so the shared keys (F5, F11)
// go to the debugger while it is paused and to the built-in command otherwise.

import { activeDoc, getState, setPanel } from "@frontend/app/store";
import { registerCommands, type Command } from "@frontend/commands/registry";
import { registerMenuItems } from "@frontend/commands/menus";
import { registerPanelView } from "@frontend/workbench/panels";
import { createElement } from "react";
import { DebugPanel } from "./DebugPanel";
import {
  breakpointLines,
  debugContinue,
  debugPause,
  debugState,
  debugStepInto,
  debugStepOut,
  debugStepOver,
  removeAllBreakpoints,
  startDebugging,
  toggleBreakpoint,
} from "./debugger";
import { targetEditor } from "@frontend/workbench/editors";

const paused = () => debugState().status === "paused";
const canStart = () =>
  getState().runtime.state === "ready" && !!activeDoc() && debugState().status !== "running" && debugState().status !== "paused";

const DEBUG_COMMANDS: Command[] = [
  { id: "debug.start", title: "Start Debugging", category: "Run", icon: "bug", keybinding: "F6", enabled: canStart, run: () => void startDebugging() },
  {
    id: "debug.toggleBreakpoint",
    title: "Toggle Breakpoint",
    category: "Run",
    keybinding: "F9",
    enabled: () => !!activeDoc(),
    run: () => {
      const editor = targetEditor();
      const model = editor?.getModel();
      const line = editor?.getPosition()?.lineNumber;
      if (model && line) toggleBreakpoint(model, line);
    },
  },
  // F5 is Run; while paused it continues (registered first, so it wins then).
  { id: "debug.continue", title: "Continue", category: "Run", icon: "run", keybinding: "F5", contextual: true, enabled: paused, run: debugContinue },
  { id: "debug.pause", title: "Pause", category: "Run", icon: "pause", keybinding: "F6", contextual: true, enabled: () => debugState().status === "running", run: debugPause },
  { id: "debug.stepOver", title: "Step Over", category: "Run", icon: "stepOver", keybinding: "F10", contextual: true, enabled: paused, run: debugStepOver },
  { id: "debug.stepInto", title: "Step Into", category: "Run", icon: "stepInto", keybinding: "F11", contextual: true, enabled: paused, run: debugStepInto },
  { id: "debug.stepOut", title: "Step Out", category: "Run", icon: "stepOut", keybinding: "Shift+F11", contextual: true, enabled: paused, run: debugStepOut },
  {
    id: "debug.removeAllBreakpoints",
    title: "Remove All Breakpoints",
    category: "Run",
    enabled: () => getState().docs.some((d) => breakpointLines(d.model).length > 0),
    run: removeAllBreakpoints,
  },
  { id: "view.debug", title: "Debug", category: "View", icon: "bug", run: () => setPanel("debug") },
];

export function installDebugCommands() {
  registerCommands(DEBUG_COMMANDS);
  registerMenuItems("menubar.run", [
    { command: "debug.start", group: "3a_debug", order: 1 },
    { command: "debug.toggleBreakpoint", group: "3a_debug", order: 2 },
    { command: "debug.continue", group: "3b_steps", order: 1 },
    { command: "debug.pause", group: "3b_steps", order: 1 },
    { command: "debug.stepOver", group: "3b_steps", order: 2 },
    { command: "debug.stepInto", group: "3b_steps", order: 3 },
    { command: "debug.stepOut", group: "3b_steps", order: 4 },
    { command: "debug.removeAllBreakpoints", group: "3c_bp", order: 1 },
  ]);
  registerMenuItems("menubar.view", [{ command: "view.debug", group: "3_panels", order: 6 }]);
  registerPanelView({ id: "debug", title: "Debug", icon: "bug", order: 45, render: () => createElement(DebugPanel) });
}
