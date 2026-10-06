// The command registry: every user action in the workbench is a command with
// a stable id. Menus, the command palette, keybindings, toolbars and context
// menus all invoke commands by id; none has its own implementation of an
// action. Extensions add commands with `registerCommand`.

import { useSyncExternalStore } from "react";
import type { IconName } from "@frontend/workbench/icons";

/** Where keyboard focus is when a key is pressed. */
export interface KeyContext {
  /** "editor": a Definitions editor; "interactions": the REPL input;
   * "input": any other text field; "other": everything else. */
  focus: "editor" | "interactions" | "input" | "other";
}

export interface Command {
  id: string;
  title: string;
  /** Shown before the title in the command palette, e.g. "View". */
  category?: string;
  icon?: IconName;
  run(args?: unknown): unknown;
  /** Disabled commands are greyed out in menus and skipped by keybindings. */
  enabled?(): boolean;
  /** Hidden commands appear in no menu and not in the palette. */
  visible?(): boolean;
  /** A check mark in menus. */
  checked?(): boolean;
  /** Default key, e.g. "Mod+Shift+P" (Mod = Ctrl, or Cmd on macOS). */
  keybinding?: string;
  /** Default key on macOS, when it differs. */
  macKeybinding?: string;
  /** Further keys for the same command (dropped when the user rebinds it). */
  alternateKeybindings?: string[];
  /** Whether the keybinding applies in this focus context (default: always). */
  when?(ctx: KeyContext): boolean;
  /** The key is handled natively (by the editor or the operating system);
   * the binding is only displayed. */
  nativeKey?: boolean;
  /** Enabled only in a mode (e.g. the debugger paused), so its key may be
   * shared with another command; not reported as a conflict. */
  contextual?: boolean;
  /** Listed in the command palette (default true). */
  palette?: boolean;
}

const commands = new Map<string, Command>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  for (const l of listeners) l();
}

export function registerCommand(command: Command): () => void {
  commands.set(command.id, command);
  changed();
  return () => {
    if (commands.get(command.id) === command) {
      commands.delete(command.id);
      changed();
    }
  };
}

export function registerCommands(list: Command[]): () => void {
  const offs = list.map(registerCommand);
  return () => offs.forEach((f) => f());
}

export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}

export function allCommands(): Command[] {
  return [...commands.values()];
}

export function isEnabled(c: Command): boolean {
  try {
    return c.enabled ? c.enabled() : true;
  } catch {
    return false;
  }
}

export function isVisible(c: Command): boolean {
  try {
    return c.visible ? c.visible() : true;
  } catch {
    return false;
  }
}

/** Runs a command if it exists, is visible and is enabled. Returns false otherwise. */
export function executeCommand(id: string, args?: unknown): boolean {
  const c = commands.get(id);
  if (!c || !isVisible(c) || !isEnabled(c)) return false;
  try {
    const r = c.run(args);
    if (r instanceof Promise) r.catch((e) => console.error(`command ${id} failed`, e));
  } catch (e) {
    console.error(`command ${id} failed`, e);
  }
  return true;
}

/** Notifies subscribers that enablement or check state may have changed. */
export function commandsChanged() {
  changed();
}

export function subscribeCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when commands are registered or `commandsChanged` is called. */
export function useCommandsVersion(): number {
  return useSyncExternalStore(subscribeCommands, () => version);
}

/** "View: Toggle Sidebar". */
export function commandLabel(c: Command): string {
  return c.category ? `${c.category}: ${c.title}` : c.title;
}

/** For tests. */
export function resetCommandsForTests() {
  commands.clear();
  changed();
}
