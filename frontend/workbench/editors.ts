// The Monaco editor of each editor group, and which editor has focus.
// Edit and Selection commands act on the focused editor (an editor group or
// the Interactions input), or on the active group's editor.

import { monaco } from "@frontend/editor/monaco";

const byGroup = new Map<string, monaco.editor.IStandaloneCodeEditor>();
let lastFocused: monaco.editor.ICodeEditor | null = null;
let activeGroupId: string | null = null;

monaco.editor.onDidCreateEditor((editor) => {
  editor.onDidFocusEditorText(() => (lastFocused = editor));
  editor.onDidDispose(() => {
    if (lastFocused === editor) lastFocused = null;
  });
});

export function registerGroupEditor(groupId: string, editor: monaco.editor.IStandaloneCodeEditor): () => void {
  byGroup.set(groupId, editor);
  return () => {
    if (byGroup.get(groupId) === editor) byGroup.delete(groupId);
  };
}

export function setActiveGroupId(id: string) {
  activeGroupId = id;
}

export function groupEditor(groupId: string): monaco.editor.IStandaloneCodeEditor | null {
  return byGroup.get(groupId) ?? null;
}

/** The editor of the active group. */
export function activeGroupEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeGroupId ? (byGroup.get(activeGroupId) ?? null) : null;
}

/** All group editors showing a model. */
export function editorsForModel(model: monaco.editor.ITextModel): monaco.editor.IStandaloneCodeEditor[] {
  return [...byGroup.values()].filter((e) => e.getModel() === model);
}

/** The editor with keyboard focus, else the last focused, else the active group's. */
export function targetEditor(): monaco.editor.ICodeEditor | null {
  const focused = monaco.editor.getEditors().find((e) => e.hasTextFocus());
  if (focused) return focused;
  if (lastFocused && lastFocused.getModel()) return lastFocused;
  return activeGroupEditor();
}

/** Runs a Monaco action (e.g. "editor.action.selectAll") in the target editor. */
export function runEditorAction(actionId: string): boolean {
  const editor = targetEditor();
  if (!editor || !editor.getModel()) return false;
  editor.focus();
  const action = editor.getAction(actionId);
  if (action) {
    void action.run();
    return true;
  }
  editor.trigger("menu", actionId, null);
  return true;
}

/** Whether the target editor offers an action. */
export function hasEditorAction(actionId: string): boolean {
  const editor = targetEditor();
  return !!editor?.getModel() && (!!editor.getAction(actionId) || ["undo", "redo"].includes(actionId));
}
