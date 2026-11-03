// The macOS Edit menu's Undo, Redo and Select All (apps/desktop/src-tauri/src/
// menu.rs). The system's own versions act on the web view's text fields; the
// code editor keeps its text in its own model, so they did not select the
// program or undo in it. Here each applies to what has focus: an editor, a
// text field, a browser tab's page, or the text of a log (Interactions,
// Output, task output) the user clicked in.

import { monaco } from "@frontend/editor/monaco";
import { backend, isTauri, type NativeEditAction } from "@frontend/ipc/backend";
import { getState } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";

const MONACO_ACTION: Record<NativeEditAction, string> = { undo: "undo", redo: "redo", selectAll: "editor.action.selectAll" };
const COMMAND: Record<NativeEditAction, string> = { undo: "edit.undo", redo: "edit.redo", selectAll: "selection.selectAll" };

/** The browser tab whose page probably has focus (the main page does not). */
function focusedWebTab(): string | null {
  const s = getState();
  const web = new Set(s.webTabs.map((t) => t.id));
  const active = s.layout.groups[s.layout.activeGroup]?.active;
  if (active && web.has(active)) return active;
  const shown = Object.values(s.layout.groups)
    .map((g) => g.active)
    .filter((id): id is string => !!id && web.has(id));
  return shown.length === 1 ? shown[0] : null;
}

/** A log or output area holding the user's text selection or click. */
function textArea(): Element | null {
  const node = window.getSelection()?.anchorNode;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  // The whole log rather than the one entry (each is its own <pre>).
  return el?.closest('[role="log"], .output, .task-log') ?? el?.closest("pre") ?? null;
}

export function applyNativeEdit(action: NativeEditAction) {
  if (!document.hasFocus()) {
    const tab = focusedWebTab();
    if (tab) void backend.browserEdit(tab, action).catch(() => {});
    return;
  }
  const editor = monaco.editor.getEditors().find((e) => e.hasTextFocus());
  if (editor) {
    editor.trigger("keyboard", MONACO_ACTION[action], null);
    return;
  }
  const el = document.activeElement as HTMLElement | null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (action === "selectAll") el.select();
    else document.execCommand(action);
    return;
  }
  if (el?.isContentEditable) {
    document.execCommand(action);
    return;
  }
  const area = action === "selectAll" ? textArea() : null;
  if (area) {
    window.getSelection()?.selectAllChildren(area);
    return;
  }
  // Nothing with text has focus: act on the editor, as the Edit and
  // Selection menus do.
  void executeCommand(COMMAND[action]);
}

let installed = false;

export function installNativeEdit() {
  if (installed || !isTauri()) return;
  installed = true;
  void backend.onNativeEdit(applyNativeEdit);
}
