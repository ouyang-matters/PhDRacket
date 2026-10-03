import { afterEach, describe, expect, it } from "vitest";
import { executeCommand, registerCommand, resetCommandsForTests } from "./registry";
import { commandsForKey, conflicts, dispatchKey, eventKey, formatKey, keybindingFor, keyContextOf, normalizeKey, setKeybindingOverrides } from "./keybindings";
import { registerMenuItems, registerMenuProvider, resetMenusForTests, resolveMenu, menuTitle } from "./menus";

afterEach(() => {
  resetCommandsForTests();
  resetMenusForTests();
  setKeybindingOverrides({});
});

function key(k: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const parts = k.split("+");
  const main = parts.pop()!;
  return {
    key: main.length === 1 ? main.toLowerCase() : main,
    code: /^[A-Z]$/.test(main) ? `Key${main}` : main === "\\" ? "Backslash" : main,
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    metaKey: parts.includes("Meta"),
    ...extra,
  } as KeyboardEvent;
}

describe("keys", () => {
  it("normalizes Mod per platform", () => {
    expect(normalizeKey("mod+shift+p", false)).toBe("Ctrl+Shift+P");
    expect(normalizeKey("Shift+Mod+P", true)).toBe("Shift+Meta+P");
    expect(normalizeKey("Mod+\\", false)).toBe("Ctrl+\\");
    expect(normalizeKey("F5", false)).toBe("F5");
  });

  it("reads events by physical key, independent of layout and Shift", () => {
    expect(eventKey(key("Ctrl+Shift+P"))).toBe("Ctrl+Shift+P");
    expect(eventKey(key("Ctrl+\\"))).toBe("Ctrl+\\");
    expect(eventKey({ key: "Control", code: "ControlLeft", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe(null);
  });

  it("formats for display", () => {
    expect(formatKey("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(formatKey("Mod+Shift+P", true)).toBe("⇧⌘P");
  });
});

describe("command registry and keybindings", () => {
  it("runs a command from one definition, whatever the entry point", () => {
    let runs = 0;
    registerCommand({ id: "run.run", title: "Run", keybinding: "Mod+Enter", run: () => runs++ });
    expect(executeCommand("run.run")).toBe(true);
    expect(dispatchKey(key("Ctrl+Enter", { code: "Enter", key: "Enter" }), { focus: "editor" }, false)).toBe(true);
    expect(runs).toBe(2);
  });

  it("skips disabled, hidden and out-of-context commands", () => {
    let ran = "";
    registerCommand({ id: "a", title: "A", keybinding: "F5", enabled: () => false, run: () => (ran = "a") });
    registerCommand({ id: "b", title: "B", keybinding: "F5", when: (c) => c.focus !== "interactions", run: () => (ran = "b") });
    expect(dispatchKey(key("F5", { code: "F5", key: "F5" }), { focus: "interactions" }, false)).toBe(false);
    expect(dispatchKey(key("F5", { code: "F5", key: "F5" }), { focus: "editor" }, false)).toBe(true);
    expect(ran).toBe("b");
    expect(executeCommand("missing")).toBe(false);
  });

  it("leaves native keys to the editor", () => {
    let ran = false;
    registerCommand({ id: "edit.undo", title: "Undo", keybinding: "Mod+Z", nativeKey: true, run: () => (ran = true) });
    expect(dispatchKey(key("Ctrl+Z"), { focus: "editor" }, false)).toBe(false);
    expect(ran).toBe(false);
  });

  it("applies user overrides and reports conflicts", () => {
    registerCommand({ id: "x", title: "X", keybinding: "Mod+K", run: () => {} });
    registerCommand({ id: "y", title: "Y", keybinding: "Mod+J", run: () => {} });
    setKeybindingOverrides({ y: "Mod+K" });
    expect(keybindingFor("y", false)).toBe("Ctrl+K");
    expect(conflicts(false)).toEqual([["Ctrl+K", ["x", "y"]]]);
    setKeybindingOverrides({ x: "" });
    expect(keybindingFor("x", false)).toBe(null);
    expect(commandsForKey("Ctrl+K", false)).toEqual([]);
  });

  it("finds the focus context from the DOM", () => {
    expect(keyContextOf(null)).toEqual({ focus: "other" });
    const el = { tagName: "TEXTAREA", closest: () => ({ getAttribute: () => "interactions" }) } as unknown as Element;
    expect(keyContextOf(el)).toEqual({ focus: "interactions" });
  });
});

describe("menus", () => {
  it("groups, orders and hides items of invisible commands", () => {
    registerCommand({ id: "file.save", title: "Save", run: () => {} });
    registerCommand({ id: "file.saveAs", title: "Save As…", run: () => {} });
    registerCommand({ id: "file.new", title: "New File", run: () => {} });
    registerCommand({ id: "edit.format", title: "Format", visible: () => false, run: () => {} });
    registerMenuItems("menubar.file", [
      { command: "file.saveAs", group: "2_save", order: 2 },
      { command: "file.save", group: "2_save", order: 1 },
      { command: "file.new", group: "1_new" },
      { command: "edit.format", group: "3_x" },
    ]);
    expect(resolveMenu("menubar.file").map((g) => g.map(menuTitle))).toEqual([["New File"], ["Save", "Save As…"]]);
  });

  it("drops empty submenus and includes provided items", () => {
    registerCommand({ id: "file.openRecent", title: "Open Recent File", run: () => {} });
    registerMenuItems("menubar.file", [{ submenu: "menubar.file.recent", title: "Open Recent" }]);
    expect(resolveMenu("menubar.file")).toEqual([]);
    const off = registerMenuProvider("menubar.file.recent", () => [{ command: "file.openRecent", args: "/a.rkt", title: "a.rkt" }]);
    expect(resolveMenu("menubar.file").flat().map(menuTitle)).toEqual(["Open Recent"]);
    off();
    expect(resolveMenu("menubar.file")).toEqual([]);
  });
});
