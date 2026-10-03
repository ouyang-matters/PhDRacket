// End-to-end test of the workbench shell in the real desktop app: menus,
// command palette, keybindings, editor groups and splits, panels, themes.
// Keys and clicks are sent as trusted input through the WebView2 DevTools
// protocol, so they take the same path as a user's.
//
//   pnpm dev                                   # in another terminal
//   node apps/desktop/e2e/workbench.mjs [path-to-phdracket.exe]
//
// Windows only, like smoke.mjs. Screenshots go to apps/desktop/e2e/out/.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

const exe =
  process.argv[2] ??
  join(process.env.CARGO_TARGET_DIR ?? join(repo, "target"), "debug", process.platform === "win32" ? "phdracket.exe" : "phdracket");
const port = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failures++;
}

const work = join(tmpdir(), `phdracket-workbench-e2e-${process.pid}`);
mkdirSync(work, { recursive: true });
const terms = /^Last Updated: (.+)$/m.exec(readFileSync(join(repo, "docs/TERMS.md"), "utf8"))[1].trim();
const settingsFile = join(work, "settings.json");
writeFileSync(settingsFile, JSON.stringify({ ui: { setupDone: true, termsAccepted: "", checkForUpdates: false, showAnnouncements: false, theme: "phd-dark" } }));

const app = spawn(exe, [], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: join(work, "webview2"),
    PHDRACKET_SETTINGS_FILE: settingsFile,
  },
  stdio: "inherit",
});

async function connect() {
  for (let i = 0; i < 120; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((p) => p.type === "page" && p.url.includes("localhost:1420"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("the app's WebView did not start");
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const cdp = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
};
const evaluate = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const waitFor = async (expr, what, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`!!(${expr})`).catch(() => false)) return true;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const screenshot = async (name) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
};

const VK = { Enter: 13, Escape: 27, Backslash: 220, ArrowDown: 40, F1: 112 };
/** A trusted key press, e.g. key("Ctrl+Shift+P"). */
async function key(combo) {
  const parts = combo.split("+");
  const main = parts.pop();
  const mods = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Ctrl") ? 2 : 0) | (parts.includes("Meta") ? 4 : 0) | (parts.includes("Shift") ? 8 : 0);
  const code = main === "\\" ? "Backslash" : main.length === 1 ? `Key${main.toUpperCase()}` : main;
  const vk = VK[code] ?? (main.length === 1 ? main.toUpperCase().charCodeAt(0) : 0);
  const keyName = main.length === 1 ? (mods & 8 ? main.toUpperCase() : main.toLowerCase()) : main;
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: mods, key: keyName, code, windowsVirtualKeyCode: vk });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", modifiers: mods, key: keyName, code, windowsVirtualKeyCode: vk });
  await sleep(150);
}
async function type(text) {
  await cdp("Input.insertText", { text });
  await sleep(150);
}
async function click(selector, text) {
  const box = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${text ? `e.textContent.trim().startsWith(${JSON.stringify(text)})` : "true"});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing to click: ${selector} ${text ?? ""}`);
  for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(150);
}

const S = "window.__phdracket";
const state = (path) => evaluate(`JSON.parse(JSON.stringify(${S}.getState().${path}))`);

try {
  await waitFor(`${S} && ${S}.getState().dialog === "setup"`, "Setup asking for the Terms");
  check((await evaluate(`document.title`)) === "PhDRacket Beta", "the window title says Beta");
  check(!(await evaluate(`!!document.querySelector(".menubar-item")`)), "before the Terms are accepted the menus are locked");
  await key("Ctrl+Shift+P");
  await key("Ctrl+P");
  check(!(await evaluate(`!!document.querySelector(".quick-input")`)), "before the Terms are accepted shortcuts do nothing");
  await evaluate(`document.querySelector(".terms-check input").click()`);
  await sleep(200);
  await waitFor(`${S}.getState().runtime.state !== "detecting"`, "runtime detection", 120000);
  await evaluate(`document.querySelector(".setup .primary").click()`);
  await waitFor(`${S}.getState().dialog === null && ${S}.getState().prefs.termsAccepted === ${JSON.stringify(terms)}`, "the Terms to be accepted");
  check(await evaluate(`!!document.querySelector(".menubar-item")`), "after accepting, the menus appear");
  await waitFor(`!document.getElementById("splash")`, "the startup screen to leave", 15000);
  check(true, "startup screen leaves once the workbench is ready");
  await waitFor(`${S}.getState().runtime.state === "ready"`, "Racket", 120000);
  await screenshot("wb-00-start-page");
  check(await evaluate(`!!document.querySelector(".start-page")`), "start page when nothing is open");

  // Menu bar
  const menus = await evaluate(`[...document.querySelectorAll(".menubar-item")].map((b) => b.textContent)`);
  check(JSON.stringify(menus) === JSON.stringify(["File", "Edit", "Selection", "View", "Go", "Run", "Tools", "Help"]), `menu bar: ${menus.join(" ")}`);
  await click(".menubar-item", "File");
  const fileItems = await evaluate(`[...document.querySelectorAll(".menu-list .menu-label")].map((b) => b.textContent)`);
  check(fileItems.includes("Open Folder…") && fileItems.includes("Save All") && fileItems.includes("Preferences"), `File menu: ${fileItems.join(", ")}`);
  await screenshot("wb-01-file-menu");
  await key("Escape");
  check(await evaluate(`!document.querySelector(".menu-list")`), "Escape closes the menu");

  // Open a folder and a file.
  const file = join(work, "a.rkt");
  copyFileSync(join(repo, "compatibility-tests/corpus/bsl/tests-mixed.rkt"), file);
  copyFileSync(join(repo, "compatibility-tests/corpus/bsl/basics.rkt"), join(work, "b.rkt"));
  const before = sha(file);
  await evaluate(`${S}.setFolder(${JSON.stringify(work)})`);

  // Quick Open (Ctrl+P) finds files in the folder.
  await key("Ctrl+P");
  await waitFor(`document.querySelector(".quick-input")`, "Quick Open");
  await type("a.rk");
  await waitFor(`document.querySelector(".quick-list li.selected")?.textContent.includes("a.rkt")`, "a.rkt in Quick Open");
  await key("Enter");
  await waitFor(`${S}.getState().docs.length === 1`, "a.rkt to open");
  check(true, "Ctrl+P opens a file from the folder");

  // Command palette (Ctrl+Shift+P) uses the same registry: split the editor.
  await key("Ctrl+Shift+P");
  await waitFor(`document.querySelector(".quick-input")`, "the command palette");
  await type("split editor right");
  await waitFor(`document.querySelector(".quick-list li.selected")?.textContent.includes("Split Editor Right")`, "the split command");
  await screenshot("wb-02-command-palette");
  await key("Enter");
  await waitFor(`Object.keys(${S}.getState().layout.groups).length === 2`, "two editor groups");
  const layout = await state("layout");
  check(layout.root.type === "split" && layout.root.orientation === "row", "Split Editor Right creates a side-by-side layout");
  const shared = await evaluate(`(() => {
    const models = [...document.querySelectorAll(".editor-group")].length;
    const doc = ${S}.getState().docs[0];
    const groups = Object.values(${S}.getState().layout.groups);
    return models === 2 && groups.every((g) => g.active === doc.id);
  })()`);
  check(shared, "both groups show the same document");

  // Typing in one group appears in the other (one shared model).
  // Insert near the top, where both editors render it.
  await evaluate(`(() => { const m = ${S}.getState().docs[0].model; m.pushEditOperations([], [{ range: { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 }, text: ";; edited in group 2\\n" }], () => null); })()`);
  await sleep(200);
  const both = await evaluate(`[...document.querySelectorAll(".editor-group .view-lines")].map((v) => v.textContent.replace(/\\u00a0/g, " ").includes("edited in group 2"))`);
  check(both.length === 2 && both.every(Boolean), "an edit shows in both groups (shared model, no duplicate buffer)");
  await screenshot("wb-03-split-right");

  // Split down from the second group via its keyboard shortcut and the menu.
  await click(".menubar-item", "View");
  await click(".menu-list button", "Editor Layout");
  await click(".submenu .menu-list button", "Split Editor Down");
  await waitFor(`Object.keys(${S}.getState().layout.groups).length === 3`, "three groups");
  const tree = await state("layout.root");
  check(tree.type === "split" && tree.children[1].type === "split" && tree.children[1].orientation === "column", "View > Editor Layout > Split Down nests a column split");
  await screenshot("wb-04-nested-split");

  // Single layout joins every group; nothing is lost.
  await key("Ctrl+Shift+P");
  await type("editor layout: single");
  await key("Enter");
  await waitFor(`Object.keys(${S}.getState().layout.groups).length === 1`, "a single group");
  check((await evaluate(`${S}.getState().docs.length`)) === 1, "Single layout keeps the document open");

  // Open b.rkt, move it into a new group below via the tab context menu.
  await evaluate(`${S}.openPath(${JSON.stringify(join(work, "b.rkt"))})`);
  await waitFor(`${S}.getState().docs.length === 2`, "b.rkt");
  const tabBox = await evaluate(`(() => { const r = [...document.querySelectorAll(".tab")].find((t) => t.textContent.includes("b.rkt")).getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: tabBox.x, y: tabBox.y, button: "right", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: tabBox.x, y: tabBox.y, button: "right", clickCount: 1 });
  await waitFor(`document.querySelector(".context-menu")`, "the tab context menu");
  await screenshot("wb-05-tab-context-menu");
  await click(".context-menu button", "Move into New Group Below");
  await waitFor(`Object.keys(${S}.getState().layout.groups).length === 2`, "b.rkt in a new group");
  const groups = Object.values(await state("layout.groups"));
  check(groups.some((g) => g.tabs.length === 1 && g.tabs[0] === groups.find((x) => x.tabs.length === 1).tabs[0]) && groups.length === 2, "Move into New Group moves the tab");

  // Run from the keyboard: the official test engine still reports.
  await key("Ctrl+Enter");
  await waitFor(`${S}.getState().run.status === "ready" && ${S}.getState().run.tests`, "Run");
  const tests = await state("run.tests");
  check(tests.total > 0, `Ctrl+Enter runs the active group's file: ${tests.total - tests.failed}/${tests.total} tests`);
  await evaluate(`${S}.setPanel("tests")`);
  await screenshot("wb-06-run-tests");

  // Panel: maximize and restore, then toggle with Ctrl+J.
  await click(".panel-actions .icon-button[title='Maximize Panel']");
  check(await state("panelMaximized"), "the panel maximizes");
  await screenshot("wb-07-panel-maximized");
  await click(".panel-actions .icon-button[title='Restore Panel Size']");
  await key("Ctrl+J");
  check(!(await state("prefs.panelVisible")), "Ctrl+J hides the panel");
  await key("Ctrl+J");
  check(await state("prefs.panelVisible"), "Ctrl+J shows it again");
  await key("Ctrl+B");
  check(!(await state("prefs.explorerVisible")), "Ctrl+B hides the sidebar");
  await key("Ctrl+B");

  // Theme picker: preview on highlight, Escape restores.
  await key("Ctrl+Shift+P");
  await type("color theme");
  await key("Enter");
  await waitFor(`document.querySelector(".quick-input")?.textContent.includes("Waterloo Math Pink")`, "the theme picker");
  await type("math pink");
  await sleep(300);
  check((await evaluate(`document.documentElement.dataset.theme`)) === "waterloo-math-pink", "highlighting a theme previews it");
  await screenshot("wb-08-theme-preview");
  await key("Escape");
  await sleep(200);
  check((await evaluate(`document.documentElement.dataset.theme`)) === "phd-dark", "Escape restores the previous theme");

  // Every built-in theme applies to the workbench and the editor at once.
  const themes = ["phd-light", "phd-dark", "midnight", "paper", "hc-dark", "hc-light", "waterloo-math-pink", "waterloo-black-gold"];
  for (const t of themes) {
    await evaluate(`${S}.setPrefs({ theme: ${JSON.stringify(t)} })`);
    await sleep(350);
    const applied = await evaluate(`(() => {
      const css = getComputedStyle(document.documentElement);
      const editorBg = getComputedStyle(document.querySelector(".monaco-editor .monaco-editor-background")).backgroundColor;
      return { id: document.documentElement.dataset.theme, editorVar: css.getPropertyValue("--c-editor-background").trim(), editorBg };
    })()`);
    const rgb = applied.editorVar.match(/\w\w/g).map((h) => parseInt(h, 16)).join(", ");
    check(applied.id === t && applied.editorBg.includes(rgb), `theme ${t}: workbench and editor switch together`);
    await screenshot(`wb-theme-${t}`);
  }
  await evaluate(`${S}.setPrefs({ theme: "phd-dark" })`);

  // Keyboard Shortcuts editor.
  await key("Ctrl+Shift+P");
  await type("keyboard shortcuts");
  await key("Enter");
  await waitFor(`document.querySelector("table.keybindings")`, "Keyboard Shortcuts");
  check((await evaluate(`document.querySelectorAll("table.keybindings tbody tr").length`)) > 60, "Keyboard Shortcuts lists the commands");
  await screenshot("wb-09-keybindings");
  await key("Escape");

  check(sha(file) === before, "no source file was written by the workbench");

  // Settings: pages.
  await key("Ctrl+,");
  await waitFor(`document.querySelector(".settings-nav")`, "Settings");
  const pages = await evaluate(`[...document.querySelectorAll(".settings-nav button")].map((b) => b.textContent)`);
  check(JSON.stringify(pages) === JSON.stringify(["General", "Appearance", "Editor", "Files", "Keyboard Shortcuts"]), `Settings pages: ${pages.join(", ")}`);
  await click(".settings-nav button", "Appearance");
  await click(".theme-card .theme-name", "Paper");
  check((await state("prefs.theme")) === "paper", "a theme card applies the theme");
  await screenshot("wb-10-settings-appearance");
  await click(".settings-nav button", "Files");
  await evaluate(`(() => { const sel = document.querySelector(".settings-page select"); sel.value = "onFocusChange"; sel.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  check((await state("prefs.autosave")) === "onFocusChange", "auto save mode can be chosen");
  await click(".settings-nav button", "Editor");
  await screenshot("wb-11-settings-editor");
  await click(".settings-nav button", "Keyboard Shortcuts");
  check(await evaluate(`!!document.querySelector(".settings-page table.keybindings")`), "Keyboard Shortcuts is a Settings page");
  await evaluate(`${S}.setPrefs({ theme: "phd-dark", autosave: "off" })`);
  await key("Escape");

  // Unsaved changes: in-app dialog with Save, Don't Save and Cancel.
  // One group, so closing the tab closes the file (a file shown in another
  // group closes without asking).
  await evaluate(`${S}.applyEditorLayout("single")`);
  await evaluate(`${S}.openPath(${JSON.stringify(file)})`);
  await waitFor(`${S}.activeDoc()?.path === ${JSON.stringify(file)}`, "a.rkt active");
  await evaluate(`(() => { const m = ${S}.activeDoc().model; m.pushEditOperations([], [{ range: m.getFullModelRange().collapseToEnd(), text: "\\n(define saved-by-dialog 1)\\n" }], () => null); })()`);
  // Let the editor take focus before the key.
  await sleep(400);
  await key("Ctrl+W");
  await waitFor(`document.querySelector(".unsaved-modal")`, "the unsaved-changes dialog");
  const buttons = await evaluate(`[...document.querySelectorAll(".unsaved-actions button")].map((b) => b.textContent)`);
  check(JSON.stringify(buttons) === JSON.stringify(["Don't Save", "Cancel", "Save"]), `unsaved dialog offers: ${buttons.join(", ")}`);
  await screenshot("wb-12-unsaved");
  await click(".unsaved-actions button", "Cancel");
  check(await evaluate(`${S}.getState().docs.some((d) => d.path === ${JSON.stringify(file)})`), "Cancel keeps the file open");
  await key("Ctrl+W");
  await waitFor(`document.querySelector(".unsaved-modal")`, "the dialog again");
  await click(".unsaved-actions button", "Save");
  await waitFor(`!${S}.getState().docs.some((d) => d.path === ${JSON.stringify(file)})`, "the file to close");
  check(readFileSync(file, "utf8").includes("saved-by-dialog"), "Save writes the file, then closes it");
} catch (e) {
  failures++;
  console.error(e);
  await screenshot("wb-error").catch(() => {});
} finally {
  ws.close();
  app.kill();
}

console.log(failures === 0 ? "\nWorkbench E2E test passed." : `\nWorkbench E2E test: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
