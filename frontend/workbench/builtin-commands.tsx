// The workbench's built-in commands and where they appear in menus. Each
// action is defined once here and reached from menus, the command palette,
// keybindings, toolbars and context menus.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { exit } from "@tauri-apps/plugin-process";
import {
  activeDoc,
  applyEditorLayout,
  canReopenClosedEditor,
  closeAllEditors,
  closeFolder,
  closeGroup,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  focusAdjacentGroup,
  focusGroup,
  getState,
  isDirty,
  moveTabToNewGroup,
  openFolderWithDialog,
  openPath,
  openWithDialog,
  reopenClosedEditor,
  runActive,
  saveDoc,
  setDialog,
  setPanel,
  setPrefs,
  splitEditor,
  stepActive,
  stopProgram,
  toggleExplorer,
  togglePanelMaximized,
  toggleZen,
  confirmQuit,
  openSettings,
} from "@frontend/app/store";
import { backend } from "@frontend/ipc/backend";
import { LINKS } from "@frontend/app/links";
import { checkForUpdates } from "@frontend/app/updates";
import { goTo } from "@frontend/problems/DiagnosticView";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID } from "@frontend/editor/racket-language";
import { enclosingSexp } from "@frontend/editor/sexp";
import { topLevelDefinitions } from "@frontend/editor/symbols";
import { groupOrder } from "./layout";
import { registerCommands, type Command } from "@frontend/commands/registry";
import { registerMenuItems, registerMenuProvider, type MenuItem } from "@frontend/commands/menus";
import { installExplorerCommands } from "@frontend/explorer/commands";
import { openBrowserTab } from "@frontend/browser/BrowserView";
import { runEditorAction, targetEditor } from "./editors";
import { showCommandPalette, showLanguagePicker, showProfilePicker, showQuickOpen, showThemePicker } from "./pickers";
import { toggleSidebarView } from "./sidebar";

const hasDoc = () => !!activeDoc();
/** A document or a browser tab is active. */
const hasTab = () => !!getState().layout.groups[getState().layout.activeGroup]?.active;
const hasEditor = () => !!targetEditor()?.getModel();
const notInInteractions = (c: { focus: string }) => c.focus !== "interactions";
const runtimeReady = () => getState().runtime.state === "ready" && hasDoc();

/** An Edit or Selection command performed by the editor itself. */
function editorAction(id: string, title: string, action: string, category: string, keybinding?: string, extra: Partial<Command> = {}): Command {
  return { id, title, category, keybinding, nativeKey: !!keybinding, enabled: hasEditor, run: () => runEditorAction(action), ...extra };
}

/** The tab a tab command applies to: the one its context menu was opened on,
 * else the active one. */
function tabArgs(args: unknown): { groupId: string; docId: string } | null {
  const a = args as { groupId?: string; docId?: string } | undefined;
  if (a?.groupId && a.docId) return { groupId: a.groupId, docId: a.docId };
  const s = getState();
  const g = s.layout.groups[s.layout.activeGroup];
  return g?.active ? { groupId: g.id, docId: g.active } : null;
}

/** A tab's file path, or a browser tab's address. */
function tabPath(id: string): string | null {
  const s = getState();
  return s.docs.find((d) => d.id === id)?.path ?? (s.webTabs.find((w) => w.id === id)?.url || null);
}

// Structural selection: each editor remembers the selections it expanded from.
const sexpHistory = new WeakMap<monaco.editor.ICodeEditor, monaco.Selection[]>();

function expandSexp() {
  const editor = targetEditor();
  const model = editor?.getModel();
  const sel = editor?.getSelection();
  if (!editor || !model || !sel) return;
  const text = model.getValue();
  const range = enclosingSexp(text, model.getOffsetAt(sel.getStartPosition()), model.getOffsetAt(sel.getEndPosition()));
  if (!range) return;
  sexpHistory.set(editor, [...(sexpHistory.get(editor) ?? []), sel]);
  const start = model.getPositionAt(range[0]);
  const end = model.getPositionAt(range[1]);
  editor.setSelection(new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column));
}

function shrinkSexp() {
  const editor = targetEditor();
  const prev = editor ? sexpHistory.get(editor)?.pop() : undefined;
  if (editor && prev) editor.setSelection(prev);
}

let failureIndex = -1;
function gotoTestFailure(delta: number) {
  const tests = getState().run.tests;
  const failures = (tests?.failures ?? []).filter((f) => f !== null);
  if (!tests || failures.length === 0) return;
  failureIndex = (failureIndex + delta + failures.length) % failures.length;
  goTo(failures[failureIndex]!, tests.origin);
}

async function saveAll() {
  for (const d of getState().docs.filter(isDirty)) if (!(await saveDoc(d))) return;
}

async function toggleFullScreen() {
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}

function zoom(delta: number | null) {
  const size = getState().prefs.fontSize;
  setPrefs({ fontSize: delta === null ? 14 : Math.min(Math.max(size + delta, 8), 40) });
}

export const BUILTIN_COMMANDS: Command[] = [
  // File
  { id: "file.newFile", title: "New File…", category: "File", icon: "newFile", keybinding: "Mod+N", run: () => setDialog("new-file") },
  { id: "file.openFile", title: "Open File…", category: "File", icon: "openFile", keybinding: "Mod+O", run: () => openWithDialog() },
  { id: "file.openFolder", title: "Open Folder…", category: "File", icon: "folder", keybinding: "Mod+Shift+O", run: () => openFolderWithDialog() },
  { id: "file.openRecent", title: "Open Recent File", category: "File", palette: false, run: (path) => typeof path === "string" && openPath(path) },
  { id: "file.save", title: "Save", category: "File", icon: "save", keybinding: "Mod+S", enabled: hasDoc, run: () => saveDoc() },
  { id: "file.saveAs", title: "Save As…", category: "File", keybinding: "Mod+Shift+S", enabled: hasDoc, run: () => saveDoc(undefined, true) },
  { id: "file.saveAll", title: "Save All", category: "File", keybinding: "Mod+Alt+S", enabled: () => getState().docs.some(isDirty), run: saveAll },
  {
    id: "file.closeEditor",
    title: "Close Editor",
    category: "File",
    keybinding: "Mod+W",
    enabled: hasDoc,
    run: (args) => {
      const t = tabArgs(args);
      if (t) void closeTab(t.groupId, t.docId);
    },
  },
  { id: "file.closeAllEditors", title: "Close All Editors", category: "File", enabled: hasDoc, run: closeAllEditors },
  { id: "file.reopenClosedEditor", title: "Reopen Closed Editor", category: "File", keybinding: "Mod+Shift+T", enabled: canReopenClosedEditor, run: reopenClosedEditor },
  { id: "file.closeFolder", title: "Close Folder", category: "File", enabled: () => getState().folder !== null, run: closeFolder },
  { id: "file.closeWindow", title: "Close Window", category: "File", run: () => getCurrentWindow().close() },
  {
    id: "file.exit",
    title: "Exit",
    category: "File",
    macKeybinding: "Mod+Q",
    run: async () => {
      if (await confirmQuit()) await exit(0);
    },
  },
  { id: "preferences.settings", title: "Settings", category: "Preferences", icon: "settings", keybinding: "Mod+,", run: () => openSettings() },
  { id: "preferences.keyboardShortcuts", title: "Keyboard Shortcuts", category: "Preferences", icon: "keyboard", run: () => openSettings("keyboard") },
  { id: "preferences.colorTheme", title: "Color Theme", category: "Preferences", icon: "themes", run: showThemePicker },

  // Edit
  editorAction("edit.undo", "Undo", "undo", "Edit", "Mod+Z"),
  editorAction("edit.redo", "Redo", "redo", "Edit", "Mod+Y", { macKeybinding: "Mod+Shift+Z" }),
  editorAction("edit.cut", "Cut", "editor.action.clipboardCutAction", "Edit", "Mod+X"),
  editorAction("edit.copy", "Copy", "editor.action.clipboardCopyAction", "Edit", "Mod+C"),
  editorAction("edit.paste", "Paste", "editor.action.clipboardPasteAction", "Edit", "Mod+V"),
  editorAction("edit.find", "Find", "actions.find", "Edit", "Mod+F"),
  editorAction("edit.replace", "Replace", "editor.action.startFindReplaceAction", "Edit", "Mod+H"),
  { id: "edit.findInFiles", title: "Find in Files", category: "Edit", icon: "search", keybinding: "Mod+Shift+F", enabled: () => getState().folder !== null, run: () => setPrefs({ sidebarView: "search", explorerVisible: true }) },
  editorAction("edit.toggleLineComment", "Toggle Line Comment", "editor.action.commentLine", "Edit", "Mod+/"),
  editorAction("edit.toggleBlockComment", "Toggle Block Comment", "editor.action.blockComment", "Edit", "Shift+Alt+A"),
  // No Racket formatter exists yet; the commands stay hidden until one does.
  { id: "edit.formatDocument", title: "Format Document", category: "Edit", visible: () => false, run: () => {} },
  { id: "edit.formatSelection", title: "Format Selection", category: "Edit", visible: () => false, run: () => {} },

  // Selection
  editorAction("selection.selectAll", "Select All", "editor.action.selectAll", "Selection", "Mod+A"),
  editorAction("selection.expand", "Expand Selection", "editor.action.smartSelect.expand", "Selection", "Shift+Alt+Right"),
  editorAction("selection.shrink", "Shrink Selection", "editor.action.smartSelect.shrink", "Selection", "Shift+Alt+Left"),
  { id: "selection.enclosingSexp", title: "Select Enclosing S-expression", category: "Selection", keybinding: "Mod+Alt+Up", enabled: hasEditor, run: expandSexp },
  { id: "selection.shrinkSexp", title: "Shrink S-expression Selection", category: "Selection", keybinding: "Mod+Alt+Down", enabled: hasEditor, run: shrinkSexp },
  editorAction("selection.addCursorAbove", "Add Cursor Above", "editor.action.insertCursorAbove", "Selection", "Shift+Alt+Up"),
  editorAction("selection.addCursorBelow", "Add Cursor Below", "editor.action.insertCursorBelow", "Selection", "Shift+Alt+Down"),
  editorAction("selection.addCursorsToLineEnds", "Add Cursors to Line Ends", "editor.action.insertCursorAtEndOfEachLineSelected", "Selection", "Shift+Alt+I"),
  editorAction("selection.selectNextOccurrence", "Select Next Occurrence", "editor.action.addSelectionToNextFindMatch", "Selection", "Mod+D"),
  editorAction("selection.selectAllOccurrences", "Select All Occurrences", "editor.action.selectHighlights", "Selection", "Mod+Shift+L"),
  editorAction("selection.moveLineUp", "Move Line Up", "editor.action.moveLinesUpAction", "Selection", "Alt+Up"),
  editorAction("selection.moveLineDown", "Move Line Down", "editor.action.moveLinesDownAction", "Selection", "Alt+Down"),
  editorAction("selection.duplicate", "Duplicate Selection", "editor.action.duplicateSelection", "Selection"),

  // View
  { id: "workbench.commandPalette", title: "Command Palette…", category: "View", icon: "command", keybinding: "Mod+Shift+P", alternateKeybindings: ["F1"], palette: false, run: () => showCommandPalette() },
  { id: "workbench.quickOpen", title: "Go to File…", category: "Go", keybinding: "Mod+P", run: showQuickOpen },
  { id: "view.explorer", title: "Explorer", category: "View", icon: "explorer", keybinding: "Mod+Shift+E", run: () => toggleSidebarView("explorer") },
  { id: "view.search", title: "Search", category: "View", icon: "search", run: () => toggleSidebarView("search") },
  { id: "view.problems", title: "Problems", category: "View", icon: "problems", keybinding: "Mod+Shift+M", run: () => setPanel("problems") },
  { id: "view.tests", title: "Tests", category: "View", icon: "tests", run: () => setPanel("tests") },
  { id: "view.interactions", title: "Interactions", category: "View", icon: "interactions", keybinding: "Mod+`", run: () => setPanel("interactions") },
  { id: "view.stepper", title: "Stepper", category: "View", icon: "stepper", run: () => setPanel("stepper") },
  { id: "view.output", title: "Output", category: "View", icon: "output", keybinding: "Mod+Shift+U", run: () => setPanel("output") },
  { id: "view.toggleSidebar", title: "Toggle Sidebar", category: "View", icon: "sidebar", keybinding: "Mod+B", checked: () => getState().prefs.explorerVisible, run: toggleExplorer },
  { id: "view.togglePanel", title: "Toggle Bottom Panel", category: "View", icon: "panel", keybinding: "Mod+J", checked: () => getState().prefs.panelVisible, run: () => setPrefs({ panelVisible: !getState().prefs.panelVisible }) },
  { id: "view.maximizePanel", title: "Maximize Bottom Panel", category: "View", checked: () => getState().panelMaximized, run: togglePanelMaximized },
  { id: "view.toggleStatusBar", title: "Toggle Status Bar", category: "View", checked: () => getState().prefs.statusBarVisible, run: () => setPrefs({ statusBarVisible: !getState().prefs.statusBarVisible }) },
  { id: "view.toggleMenuBar", title: "Toggle Menu Bar", category: "View", checked: () => getState().prefs.menuBarVisible, run: () => setPrefs({ menuBarVisible: !getState().prefs.menuBarVisible }) },
  { id: "view.toggleZenMode", title: "Zen Mode", category: "View", checked: () => getState().zen, run: toggleZen },
  { id: "view.toggleFullScreen", title: "Full Screen", category: "View", keybinding: "F11", run: toggleFullScreen },
  { id: "view.splitEditorRight", title: "Split Editor Right", category: "View", icon: "splitRight", keybinding: "Mod+\\", enabled: hasTab, run: () => splitEditor("right") },
  { id: "view.splitEditorDown", title: "Split Editor Down", category: "View", icon: "splitDown", enabled: hasTab, run: () => splitEditor("down") },
  { id: "view.layoutSingle", title: "Single", category: "View: Editor Layout", run: () => applyEditorLayout("single") },
  { id: "view.layoutTwoColumns", title: "Two Columns", category: "View: Editor Layout", run: () => applyEditorLayout("two-columns") },
  { id: "view.layoutTwoRows", title: "Two Rows", category: "View: Editor Layout", run: () => applyEditorLayout("two-rows") },
  { id: "view.closeEditorGroup", title: "Close Editor Group", category: "View", enabled: () => Object.keys(getState().layout.groups).length > 1, run: () => closeGroup() },
  { id: "view.focusNextGroup", title: "Focus Next Editor Group", category: "View", run: () => focusAdjacentGroup(1) },
  { id: "view.focusPreviousGroup", title: "Focus Previous Editor Group", category: "View", run: () => focusAdjacentGroup(-1) },
  ...[1, 2, 3].map(
    (n): Command => ({
      id: `view.focusGroup${n}`,
      title: `Focus Editor Group ${n}`,
      category: "View",
      keybinding: `Mod+${n}`,
      enabled: () => groupOrder(getState().layout).length >= n,
      run: () => focusGroup(groupOrder(getState().layout)[n - 1]),
    }),
  ),
  { id: "view.zoomIn", title: "Zoom In", category: "View", keybinding: "Mod+=", run: () => zoom(1) },
  { id: "view.zoomOut", title: "Zoom Out", category: "View", keybinding: "Mod+-", run: () => zoom(-1) },
  { id: "view.zoomReset", title: "Reset Zoom", category: "View", keybinding: "Mod+0", run: () => zoom(null) },

  // Go
  editorAction("go.line", "Go to Line/Column…", "editor.action.gotoLine", "Go", "Mod+G"),
  { id: "go.symbol", title: "Go to Symbol…", category: "Go", keybinding: "Mod+T", enabled: hasEditor, run: () => runEditorAction("editor.action.quickOutline") },
  editorAction("go.definition", "Go to Definition", "editor.action.revealDefinition", "Go", "F12"),
  // Not implemented yet: hidden rather than broken.
  { id: "go.references", title: "Go to References", category: "Go", visible: () => false, run: () => {} },
  { id: "go.back", title: "Back", category: "Go", visible: () => false, run: () => {} },
  { id: "go.forward", title: "Forward", category: "Go", visible: () => false, run: () => {} },
  editorAction("go.nextProblem", "Next Problem", "editor.action.marker.next", "Go", "F8"),
  editorAction("go.previousProblem", "Previous Problem", "editor.action.marker.prev", "Go", "Shift+F8"),
  { id: "go.nextTestFailure", title: "Next Test Failure", category: "Go", enabled: () => (getState().run.tests?.failed ?? 0) > 0, run: () => gotoTestFailure(1) },
  { id: "go.previousTestFailure", title: "Previous Test Failure", category: "Go", enabled: () => (getState().run.tests?.failed ?? 0) > 0, run: () => gotoTestFailure(-1) },

  // Run
  { id: "run.run", title: "Run", category: "Run", icon: "run", keybinding: "Mod+Enter", alternateKeybindings: ["F5", "Mod+R"], when: notInInteractions, enabled: runtimeReady, run: runActive },
  { id: "run.restartInteractions", title: "Restart Interactions", category: "Run", icon: "restart", enabled: runtimeReady, run: runActive },
  {
    id: "run.runTests",
    title: "Run Tests",
    category: "Run",
    icon: "tests",
    enabled: runtimeReady,
    run: async () => {
      await runActive();
      setPanel("tests");
    },
  },
  { id: "run.stepper", title: "Stepper", category: "Run", icon: "stepper", keybinding: "Mod+Shift+Enter", enabled: runtimeReady, run: stepActive },
  { id: "run.restartStepper", title: "Restart Stepper", category: "Run", enabled: () => runtimeReady() && getState().stepper.session !== null, run: stepActive },
  {
    id: "run.stop",
    title: "Stop",
    category: "Run",
    icon: "stop",
    keybinding: "Shift+F5",
    enabled: () => getState().run.status === "running" || getState().stepper.status === "running",
    run: async () => {
      if (getState().stepper.status === "running") await backend.stopStepper();
      if (getState().run.status === "running") await stopProgram();
    },
  },

  // Tools
  { id: "tools.changeLanguage", title: "Language…", category: "Tools", icon: "language", enabled: hasDoc, run: showLanguagePicker },
  { id: "tools.courseProfile", title: "Course Profile…", category: "Tools", icon: "student", run: showProfilePicker },
  { id: "tools.runtime", title: "Racket Runtime…", category: "Tools", run: () => setDialog("runtime") },

  // Help
  { id: "help.documentation", title: "PhDRacket Documentation", category: "Help", icon: "docs", run: () => openUrl(LINKS.documentation) },
  { id: "help.introduction", title: "Introducing PhDRacket", category: "Help", run: () => openUrl(LINKS.introduction) },
  { id: "help.racketDocs", title: "Racket Documentation", category: "Help", run: () => openUrl(LINKS.racketDocs) },
  { id: "help.htdpDocs", title: "HtDP Documentation", category: "Help", run: () => openUrl(LINKS.htdpDocs) },
  { id: "help.htdpLanguages", title: "HtDP Teaching Languages", category: "Help", run: () => openUrl(LINKS.htdpLanguages) },
  { id: "help.reportIssue", title: "Report Issue", category: "Help", icon: "bug", run: () => openUrl(LINKS.reportIssue) },
  { id: "help.checkForUpdates", title: "Check for Updates…", category: "Help", run: () => checkForUpdates() },
  { id: "help.releaseNotes", title: "Release Notes", category: "Help", run: () => openUrl(LINKS.releaseNotes) },
  { id: "help.terms", title: "Beta Terms of Use", category: "Help", run: () => setDialog("terms") },
  {
    id: "view.openBrowser",
    title: "Open Browser Tab",
    category: "View",
    icon: "globe",
    keybinding: "Mod+Shift+B",
    run: () => openBrowserTab(false),
  },
  {
    id: "view.openBrowserToSide",
    title: "Open Browser Tab to the Side",
    category: "View",
    icon: "globe",
    run: () => openBrowserTab(true),
  },
  { id: "help.about", title: "About PhDRacket", category: "Help", run: () => setDialog("about") },

  // Editor tabs (context menu)
  {
    id: "editor.closeOthers",
    title: "Close Others",
    category: "View",
    enabled: hasDoc,
    run: (args) => {
      const t = tabArgs(args);
      if (t) void closeOtherTabs(t.groupId, t.docId);
    },
  },
  {
    id: "editor.closeToRight",
    title: "Close to the Right",
    category: "View",
    enabled: hasDoc,
    run: (args) => {
      const t = tabArgs(args);
      if (t) void closeTabsToRight(t.groupId, t.docId);
    },
  },
  ...(["right", "down"] as const).map(
    (dir): Command => ({
      id: `editor.split${dir === "right" ? "Right" : "Down"}`,
      title: `Split ${dir === "right" ? "Right" : "Down"}`,
      category: "View",
      palette: false,
      enabled: hasTab,
      run: (args) => {
        const t = tabArgs(args);
        if (!t) return;
        focusGroup(t.groupId);
        splitEditor(dir, t.groupId);
      },
    }),
  ),
  ...(["right", "down"] as const).map(
    (dir): Command => ({
      id: `editor.moveToNewGroup${dir === "right" ? "Right" : "Down"}`,
      title: `Move into New Group ${dir === "right" ? "Right" : "Below"}`,
      category: "View",
      enabled: hasTab,
      run: (args) => {
        const t = tabArgs(args);
        if (t) moveTabToNewGroup(t.groupId, t.docId, dir);
      },
    }),
  ),
  {
    id: "editor.copyPath",
    title: "Copy Path",
    category: "File",
    enabled: () => {
      const t = tabArgs(undefined);
      return !!t && !!tabPath(t.docId);
    },
    run: (args) => {
      const t = tabArgs(args);
      const path = t && tabPath(t.docId);
      if (path) void navigator.clipboard.writeText(path);
    },
  },
];

const item = (command: string, group: string, order = 0, extra: Partial<MenuItem> = {}): MenuItem => ({ command, group, order, ...extra });

export const BUILTIN_MENUS: Record<string, MenuItem[]> = {
  "menubar.file": [
    item("file.newFile", "1_new"),
    item("file.openFile", "2_open", 1),
    item("file.openFolder", "2_open", 2),
    { submenu: "menubar.file.recent", title: "Open Recent", group: "2_open", order: 3 },
    item("file.save", "3_save", 1),
    item("file.saveAs", "3_save", 2),
    item("file.saveAll", "3_save", 3),
    item("file.closeEditor", "4_close", 1),
    item("file.reopenClosedEditor", "4_close", 2),
    item("file.closeFolder", "4_close", 3),
    item("file.closeWindow", "4_close", 4),
    { submenu: "menubar.file.preferences", title: "Preferences", group: "5_prefs" },
    item("file.exit", "6_exit"),
  ],
  "menubar.file.preferences": [item("preferences.settings", "1", 1), item("preferences.colorTheme", "1", 2), item("preferences.keyboardShortcuts", "1", 3)],
  "menubar.edit": [
    item("edit.undo", "1_undo", 1),
    item("edit.redo", "1_undo", 2),
    item("edit.cut", "2_clip", 1),
    item("edit.copy", "2_clip", 2),
    item("edit.paste", "2_clip", 3),
    item("edit.find", "3_find", 1),
    item("edit.replace", "3_find", 2),
    item("edit.findInFiles", "4_files", 1),
    item("edit.toggleLineComment", "5_comment", 1),
    item("edit.toggleBlockComment", "5_comment", 2),
    item("edit.formatDocument", "6_format", 1),
    item("edit.formatSelection", "6_format", 2),
  ],
  "menubar.selection": [
    item("selection.selectAll", "1_all"),
    item("selection.expand", "2_expand", 1),
    item("selection.shrink", "2_expand", 2),
    item("selection.enclosingSexp", "3_sexp", 1),
    item("selection.shrinkSexp", "3_sexp", 2),
    item("selection.moveLineUp", "4_lines", 1),
    item("selection.moveLineDown", "4_lines", 2),
    item("selection.duplicate", "4_lines", 3),
    item("selection.addCursorAbove", "5_cursors", 1),
    item("selection.addCursorBelow", "5_cursors", 2),
    item("selection.addCursorsToLineEnds", "5_cursors", 3),
    item("selection.selectNextOccurrence", "6_occ", 1),
    item("selection.selectAllOccurrences", "6_occ", 2),
  ],
  "menubar.view": [
    item("workbench.commandPalette", "1_palette"),
    item("view.explorer", "2_views", 1),
    item("view.search", "2_views", 2),
    item("view.openBrowser", "2_views", 3),
    item("view.openBrowserToSide", "2_views", 4),
    item("view.problems", "3_panels", 1),
    item("view.tests", "3_panels", 2),
    item("view.interactions", "3_panels", 3),
    item("view.stepper", "3_panels", 4),
    item("view.output", "3_panels", 5),
    { submenu: "menubar.view.appearance", title: "Appearance", group: "4_layout", order: 1 },
    { submenu: "menubar.view.layout", title: "Editor Layout", group: "4_layout", order: 2 },
    item("view.zoomIn", "5_zoom", 1),
    item("view.zoomOut", "5_zoom", 2),
    item("view.zoomReset", "5_zoom", 3),
  ],
  "menubar.view.appearance": [
    item("view.toggleSidebar", "1", 1),
    item("view.togglePanel", "1", 2),
    item("view.maximizePanel", "1", 3),
    item("view.toggleStatusBar", "1", 4),
    item("view.toggleMenuBar", "1", 5),
    item("view.toggleZenMode", "2", 1),
    item("view.toggleFullScreen", "2", 2),
    item("preferences.colorTheme", "3", 1),
  ],
  "menubar.view.layout": [
    item("view.splitEditorRight", "1", 1),
    item("view.splitEditorDown", "1", 2),
    item("view.layoutSingle", "2", 1),
    item("view.layoutTwoColumns", "2", 2),
    item("view.layoutTwoRows", "2", 3),
    item("view.closeEditorGroup", "3", 1),
  ],
  "menubar.go": [
    item("workbench.quickOpen", "1_go", 1),
    item("go.line", "1_go", 2),
    item("go.symbol", "1_go", 3),
    item("go.definition", "2_nav", 1),
    item("go.references", "2_nav", 2),
    item("go.back", "3_hist", 1),
    item("go.forward", "3_hist", 2),
    item("go.nextProblem", "4_problems", 1),
    item("go.previousProblem", "4_problems", 2),
    item("go.nextTestFailure", "5_tests", 1),
    item("go.previousTestFailure", "5_tests", 2),
  ],
  "menubar.run": [
    item("run.run", "1_run", 1),
    item("run.restartInteractions", "1_run", 2),
    item("run.runTests", "2_tests", 1),
    item("run.stepper", "3_stepper", 1),
    item("run.restartStepper", "3_stepper", 2),
    item("run.stop", "4_stop", 1),
  ],
  "menubar.tools": [item("tools.changeLanguage", "1_lang", 1), item("tools.courseProfile", "1_lang", 2), item("tools.runtime", "2_runtime", 1)],
  "menubar.help": [
    item("help.documentation", "1_docs", 1),
    item("help.introduction", "1_docs", 2),
    item("help.racketDocs", "2_racket", 1),
    item("help.htdpDocs", "2_racket", 2),
    item("help.htdpLanguages", "2_racket", 3),
    item("help.reportIssue", "3_issue", 1),
    item("help.checkForUpdates", "4_updates", 1),
    item("help.releaseNotes", "4_updates", 2),
    item("help.terms", "5_about", 1),
    item("help.about", "5_about", 2),
  ],
  "editor.tabContext": [
    item("file.closeEditor", "1_close", 1),
    item("editor.closeOthers", "1_close", 2),
    item("editor.closeToRight", "1_close", 3),
    item("editor.splitRight", "2_split", 1),
    item("editor.splitDown", "2_split", 2),
    item("editor.moveToNewGroupRight", "2_split", 3),
    item("editor.moveToNewGroupDown", "2_split", 4),
    item("editor.copyPath", "3_path", 1),
  ],
};

/** Go to Symbol and Go to Definition within a file, from top-level definitions. */
function registerLanguageNavigation() {
  // In PhDRacket Ctrl+Shift+O opens a folder; Go to Symbol is Ctrl+T. Move the
  // editor's own binding so its context menu shows the key that works.
  const { KeyMod, KeyCode } = monaco;
  monaco.editor.addKeybindingRules([
    { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO, command: "-editor.action.quickOutline" },
    { keybinding: KeyMod.CtrlCmd | KeyCode.KeyT, command: "editor.action.quickOutline" },
  ]);
  const symbolKind = { function: monaco.languages.SymbolKind.Function, constant: monaco.languages.SymbolKind.Constant, struct: monaco.languages.SymbolKind.Struct };
  monaco.languages.registerDocumentSymbolProvider(RACKET_LANGUAGE_ID, {
    provideDocumentSymbols: (model) =>
      topLevelDefinitions(model.getValue()).map((d) => {
        const s = model.getPositionAt(d.start);
        const e = model.getPositionAt(d.end);
        const n = model.getPositionAt(d.nameOffset);
        return {
          name: d.name,
          detail: "",
          kind: symbolKind[d.kind],
          tags: [],
          range: new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column),
          selectionRange: new monaco.Range(n.lineNumber, n.column, n.lineNumber, n.column + d.name.length),
        };
      }),
  });
  monaco.languages.registerDefinitionProvider(RACKET_LANGUAGE_ID, {
    provideDefinition: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const def = topLevelDefinitions(model.getValue()).find((d) => d.name === word.word);
      if (!def) return null;
      const n = model.getPositionAt(def.nameOffset);
      return { uri: model.uri, range: new monaco.Range(n.lineNumber, n.column, n.lineNumber, n.column + def.name.length) };
    },
  });
}

let installed = false;

export function installBuiltinCommands() {
  if (installed) return;
  installed = true;
  registerCommands(BUILTIN_COMMANDS);
  installExplorerCommands();
  for (const [menu, items] of Object.entries(BUILTIN_MENUS)) registerMenuItems(menu, items);
  registerMenuProvider("menubar.file.recent", () =>
    getState()
      .recentFiles.slice(0, 10)
      .map((path, i) => ({ command: "file.openRecent", args: path, title: path.split(/[\\/]/).pop() ?? path, group: "1", order: i })),
  );
  registerLanguageNavigation();
}
