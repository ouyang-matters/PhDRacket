// Keybindings. Keys are written "Mod+Shift+P": modifiers Mod (Ctrl, or Cmd
// on macOS), Ctrl, Alt, Shift, Meta, then one key. Defaults come from the
// commands; the user's overrides (preferences.keybindings) replace them.
//
// One dispatcher handles workbench keys for the whole window. Keys that
// belong to the editor (typing, undo, find, multi-cursor) stay with Monaco.

import { allCommands, executeCommand, getCommand, isEnabled, isVisible, type Command, type KeyContext } from "./registry";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** Canonical form: modifiers in a fixed order, key capitalized. On macOS
 * Mod means Meta; elsewhere Ctrl. */
export function normalizeKey(key: string, mac = IS_MAC): string {
  const parts = key.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  // "Ctrl++" splits into an empty last part.
  const main = key.endsWith("++") ? "+" : parts[parts.length - 1];
  const mods = new Set(parts.slice(0, key.endsWith("++") ? undefined : -1).map((m) => m.toLowerCase()));
  const out: string[] = [];
  const ctrl = mods.has("ctrl") || (!mac && mods.has("mod"));
  const meta = mods.has("meta") || mods.has("cmd") || (mac && mods.has("mod"));
  if (ctrl) out.push("Ctrl");
  if (mods.has("alt") || mods.has("option")) out.push("Alt");
  if (mods.has("shift")) out.push("Shift");
  if (meta) out.push("Meta");
  out.push(main.length === 1 ? main.toUpperCase() : main[0].toUpperCase() + main.slice(1));
  return out.join("+");
}

const CODE_KEYS: Record<string, string> = {
  Backslash: "\\",
  Slash: "/",
  Comma: ",",
  Period: ".",
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "-",
  Backquote: "`",
  Semicolon: ";",
  Quote: "'",
};

/** The canonical key for a keyboard event, or null for a lone modifier. */
export function eventKey(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (CODE_KEYS[e.code]) key = CODE_KEYS[e.code];
  else key = e.key === " " ? "Space" : e.key;
  const out: string[] = [];
  if (e.ctrlKey) out.push("Ctrl");
  if (e.altKey) out.push("Alt");
  if (e.shiftKey) out.push("Shift");
  if (e.metaKey) out.push("Meta");
  out.push(key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  return out.join("+");
}

/** "Ctrl+Shift+P", or "⌃⇧P"-style symbols on macOS. */
export function formatKey(key: string, mac = IS_MAC): string {
  const k = normalizeKey(key, mac);
  if (!k) return "";
  if (!mac) return k;
  const sym: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
  return k
    .split("+")
    .map((p) => sym[p] ?? p)
    .join("");
}

let overrides: Record<string, string> = {};

/** Installs the user's keybindings (command id → key; "" removes). */
export function setKeybindingOverrides(map: Record<string, string>) {
  overrides = { ...map };
}

export function defaultKeybinding(c: Command, mac = IS_MAC): string | null {
  const k = mac ? (c.macKeybinding ?? c.keybinding) : c.keybinding;
  return k ? normalizeKey(k, mac) : null;
}

/** The key bound to a command now, if any. */
export function keybindingFor(id: string, mac = IS_MAC): string | null {
  if (id in overrides) return overrides[id] ? normalizeKey(overrides[id], mac) : null;
  const c = getCommand(id);
  return c ? defaultKeybinding(c, mac) : null;
}

/** Every key bound to a command: its keybinding and any alternates. */
export function allKeybindingsFor(id: string, mac = IS_MAC): string[] {
  const primary = keybindingFor(id, mac);
  const c = getCommand(id);
  const alternates = id in overrides || !c ? [] : (c.alternateKeybindings ?? []).map((k) => normalizeKey(k, mac));
  return [...(primary ? [primary] : []), ...alternates];
}

/** Commands bound to `key`, in registration order. */
export function commandsForKey(key: string, mac = IS_MAC): Command[] {
  const k = normalizeKey(key, mac);
  return allCommands().filter((c) => allKeybindingsFor(c.id, mac).includes(k));
}

/** Pairs of commands bound to the same key. */
export function conflicts(mac = IS_MAC): [string, string[]][] {
  const byKey = new Map<string, string[]>();
  for (const c of allCommands()) {
    const k = keybindingFor(c.id, mac);
    if (!k || c.contextual) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), c.id]);
  }
  return [...byKey].filter(([, ids]) => ids.length > 1);
}

/** Handles a key press: runs the first enabled, applicable workbench command
 * bound to it. Returns true if a command ran (the event should then be
 * prevented). */
export function dispatchKey(e: KeyboardEvent, ctx: KeyContext, mac = IS_MAC): boolean {
  const key = eventKey(e);
  if (!key) return false;
  for (const c of commandsForKey(key, mac)) {
    if (c.nativeKey) return false;
    if (c.when && !c.when(ctx)) continue;
    if (!isVisible(c) || !isEnabled(c)) continue;
    return executeCommand(c.id);
  }
  return false;
}

/** The focus context of an element (see `data-key-context` attributes). */
export function keyContextOf(el: Element | null): KeyContext {
  const marked = el?.closest?.("[data-key-context]")?.getAttribute("data-key-context");
  if (marked === "editor" || marked === "interactions") return { focus: marked };
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable)) {
    return { focus: "input" };
  }
  return { focus: "other" };
}
