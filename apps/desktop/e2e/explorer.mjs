// End-to-end test of the Explorer's file operations, live folder updates,
// hidden files, Properties, browser tabs and the cap toss, in the real
// desktop app. Deletes go to a test folder (PHDRACKET_TEST_TRASH_DIR), not
// the Recycle Bin. Browser tabs load pages from a local test server.
//
//   pnpm dev                                   # in another terminal
//   node apps/desktop/e2e/explorer.mjs [path-to-phdracket.exe]
//
// Windows only, like smoke.mjs. Screenshots go to apps/desktop/e2e/out/.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
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
const port = 9337;
const webPort = 8765;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failures++;
}

const work = join(tmpdir(), `phdracket-explorer-e2e-${process.pid}`);
const course = join(work, "CS145");
const outside = join(work, "outside.rkt");
const trashDir = join(work, "trash");
mkdirSync(join(course, "compiled"), { recursive: true });
writeFileSync(join(course, "a3.rkt"), "#lang htdp/bsl\n(define (f x) x)\n(check-expect (f 1) 1)\n");
writeFileSync(join(course, "notes.txt"), "remember the design recipe\n");
writeFileSync(join(course, "compiled", "a3_rkt.zo"), "x");
writeFileSync(join(course, ".secret"), "x");
writeFileSync(outside, "outside the folder");

const terms = /^Last Updated: (.+)$/m.exec(readFileSync(join(repo, "docs/TERMS.md"), "utf8"))[1].trim();
const settingsFile = join(work, "settings.json");
writeFileSync(
  settingsFile,
  JSON.stringify({
    workspaceFolder: course,
    ui: { setupDone: true, termsAccepted: terms, checkForUpdates: false, showAnnouncements: false, theme: "phd-dark" },
  }),
);

// A course page with a link that opens a new window, and a probe that tries
// to reach PhDRacket's commands (it must not be able to).
const pages = {
  "/index.html": `<!doctype html><title>Assignment 3</title><h1>Assignment 3</h1>
    <a id="spec" href="/spec.html" target="_blank">Specification</a>
    <script>
      document.body.dataset.ipc = "none";
      const i = window.__TAURI_INTERNALS__;
      if (i && i.invoke) i.invoke("settings_get").then(() => (document.body.dataset.ipc = "allowed"), () => (document.body.dataset.ipc = "denied"));
    </script>`,
  "/spec.html": `<!doctype html><title>A3 Specification</title><p>Write count-evens.</p>`,
};
const server = createServer((req, res) => {
  const body = pages[req.url];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
  res.end(body ?? "not found");
}).listen(webPort);

const app = spawn(exe, [], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: join(work, "webview2"),
    PHDRACKET_SETTINGS_FILE: settingsFile,
    PHDRACKET_TEST_TRASH_DIR: trashDir,
  },
  stdio: "inherit",
});

async function targets() {
  return (await fetch(`http://127.0.0.1:${port}/json`)).json();
}

async function connect(match) {
  for (let i = 0; i < 120; i++) {
    try {
      const page = (await targets()).find((p) => p.type === "page" && match(p.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("no such page");
}

async function session(url) {
  const ws = new WebSocket(url);
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
  return { ws, cdp, evaluate };
}

const main = await session(await connect((u) => u.includes("localhost:1420")));
const { cdp, evaluate } = main;
const waitFor = async (expr, what, timeout = 30000) => {
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

const VK = { Enter: 13, Escape: 27, Delete: 46, F2: 113, ArrowDown: 40 };
async function key(combo) {
  const parts = combo.split("+");
  const k = parts.pop();
  const mods = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Ctrl") ? 2 : 0) | (parts.includes("Shift") ? 8 : 0);
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
  const vk = VK[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
  const name = k.length === 1 ? (mods & 8 ? k.toUpperCase() : k.toLowerCase()) : k;
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: mods, key: name, code, windowsVirtualKeyCode: vk });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", modifiers: mods, key: name, code, windowsVirtualKeyCode: vk });
  await sleep(200);
}
async function type(text) {
  await cdp("Input.insertText", { text });
  await sleep(150);
}
async function point(selector, text) {
  const box = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${text ? `e.textContent.trim() === ${JSON.stringify(text)}` : "true"});
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing at ${selector} ${text ?? ""}`);
  return box;
}
async function click(selector, text, button = "left") {
  const { x, y } = await point(selector, text);
  for (const t of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x, y, button, clickCount: 1 });
  await sleep(200);
}
const row = (name) => `[...document.querySelectorAll(".explorer .tree-row .tree-name")].some((e) => e.textContent === ${JSON.stringify(name)})`;
const S = "window.__phdracket";

try {
  await waitFor(`${S} && ${S}.getState().folder`, "the folder to be restored");
  await waitFor(row("a3.rkt"), "the Explorer listing");

  // Hidden files.
  check(await evaluate(row("notes.txt")), "lists a3.rkt and notes.txt");
  check(!(await evaluate(row("compiled"))) && !(await evaluate(row(".secret"))), "hides compiled/ and dot files by default");
  await click(".explorer-head button[aria-label='Show hidden files']");
  await waitFor(row("compiled") + " && " + row(".secret"), "hidden files to show");
  check(true, "the eye button shows hidden files");
  await click(".explorer-head button[aria-label='Show hidden files']");
  await waitFor(`!(${row("compiled")})`, "hidden files to hide again");
  await evaluate(`${S}.setPrefs({ hiddenFiles: [...${S}.getState().prefs.hiddenFiles, "*.txt"] })`);
  await waitFor(`!(${row("notes.txt")})`, "a custom pattern to hide notes.txt");
  check(true, "a custom pattern (*.txt) hides notes.txt");
  await evaluate(`${S}.setPrefs({ hiddenFiles: ${S}.getState().prefs.hiddenFiles.filter((p) => p !== "*.txt") })`);
  await waitFor(row("notes.txt"), "notes.txt back");

  // Live updates from outside the app.
  writeFileSync(join(course, "from-outside.rkt"), "#lang racket\n");
  await waitFor(row("from-outside.rkt"), "a file created outside the app to appear", 10000);
  check(true, "a file created outside the app appears by itself");
  rmSync(join(course, "from-outside.rkt"));
  await waitFor(`!(${row("from-outside.rkt")})`, "a file deleted outside the app to disappear", 10000);
  check(true, "a file deleted outside the app disappears by itself");

  // New file: typed in place, created on disk and opened.
  await click(".explorer-head button[aria-label='New File']");
  await waitFor(`document.activeElement?.classList.contains("tree-input")`, "the name box");
  await evaluate(`document.activeElement.select()`);
  await type("q2.rkt");
  await key("Enter");
  await waitFor(`${S}.getState().docs.some((d) => d.name === "q2.rkt")`, "q2.rkt to open");
  check(existsSync(join(course, "q2.rkt")), "New File creates q2.rkt on disk and opens it");

  // Rename with F2: the open tab follows.
  await click(".explorer .tree-row .tree-name", "q2.rkt");
  await key("F2");
  await waitFor(`document.activeElement?.classList.contains("tree-input")`, "the rename box");
  await evaluate(`document.activeElement.select()`);
  await type("question2.rkt");
  await key("Enter");
  await waitFor(`${S}.getState().docs.some((d) => d.name === "question2.rkt" && d.path.endsWith("question2.rkt"))`, "the tab to follow the rename");
  check(existsSync(join(course, "question2.rkt")) && !existsSync(join(course, "q2.rkt")), "F2 renames on disk; the open tab follows");
  const bad = await evaluate(`(async () => { try { await window.__TAURI_INTERNALS__.invoke("fs_rename", { root: ${JSON.stringify(course)}, path: ${JSON.stringify(join(course, "a3.rkt"))}, name: "a/b.rkt" }); return "renamed"; } catch (e) { return String(e); } })()`);
  check(/cannot contain/.test(bad), `invalid names are refused (${bad})`);

  // Duplicate (Ctrl+D), new folder, cut and paste into it.
  await click(".explorer .tree-row .tree-name", "question2.rkt");
  await key("Ctrl+D");
  await waitFor(row("question2 copy.rkt"), "the duplicate");
  check(existsSync(join(course, "question2 copy.rkt")), "Ctrl+D duplicates as \"question2 copy.rkt\"");
  await click(".explorer-head button[aria-label='New Folder']");
  await waitFor(`document.activeElement?.classList.contains("tree-input")`, "the folder name box");
  await evaluate(`document.activeElement.select()`);
  await type("drafts");
  await key("Enter");
  await waitFor(row("drafts"), "the new folder");
  await click(".explorer .tree-row .tree-name", "question2 copy.rkt");
  await key("Ctrl+X");
  await click(".explorer .tree-row .tree-name", "drafts");
  await key("Ctrl+V");
  await waitFor(`${row("question2 copy.rkt")} && document.querySelector(".explorer .tree .tree .tree-name")?.textContent === "question2 copy.rkt"`, "the pasted file inside drafts", 10000);
  check(existsSync(join(course, "drafts", "question2 copy.rkt")) && !existsSync(join(course, "question2 copy.rkt")), "cut and paste moves into the folder");

  // Context menu and Properties.
  await click(".explorer .tree-row .tree-name", "a3.rkt", "right");
  await waitFor(`document.querySelector(".context-menu")`, "the context menu");
  const items = await evaluate(`[...document.querySelectorAll(".context-menu .menu-label")].map((e) => e.textContent)`);
  check(["Open", "New File in Explorer…", "Rename…", "Delete (Move to Recycle Bin)", "Copy Path", "Reveal in File Explorer", "Properties"].every((i) => items.includes(i)), `context menu: ${items.join(", ")}`);
  await screenshot("explorer-01-context-menu");
  // The menu closes when the window loses focus (other windows on a shared desktop); reopen once if so.
  if (!(await evaluate(`!!document.querySelector(".context-menu")`))) {
    await click(".explorer .tree-row .tree-name", "a3.rkt", "right");
    await waitFor(`document.querySelector(".context-menu")`, "the context menu again");
  }
  await click(".context-menu .menu-label", "Properties");
  await waitFor(`document.querySelector(".properties")`, "the Properties dialog");
  const props = await evaluate(`document.querySelector(".properties").innerText`);
  check(props.includes("Racket source") && props.includes("#lang htdp/bsl") && /Lines\s+3/.test(props), "Properties: type, language, lines");
  await screenshot("explorer-02-properties");
  await key("Escape");
  const foot = await evaluate(`document.querySelector(".explorer-foot")?.innerText ?? ""`);
  check(foot.includes("a3.rkt") && foot.includes("3 lines"), "the selection's size and lines show under the tree");

  // Delete: asks in the app, goes to the trash folder, closes the tab.
  await click(".explorer .tree-row .tree-name", "question2.rkt");
  await key("Delete");
  await waitFor(`document.querySelector(".confirm-delete")`, "the delete confirmation");
  await screenshot("explorer-03-delete");
  await click(".confirm-delete button", "Move to Recycle Bin");
  await waitFor(`!(${row("question2.rkt")})`, "the deleted file to disappear");
  check(!existsSync(join(course, "question2.rkt")) && readdirSync(trashDir).includes("question2.rkt"), "Delete moves to the (test) Recycle Bin");
  check(!(await evaluate(`${S}.getState().docs.some((d) => d.name === "question2.rkt")`)), "the deleted file's tab is closed");

  // Nothing outside the open folder can be touched.
  const outsideResult = await evaluate(`(async () => { try { await window.__TAURI_INTERNALS__.invoke("fs_trash", { root: ${JSON.stringify(course)}, path: ${JSON.stringify(outside)} }); return "deleted"; } catch (e) { return String(e); } })()`);
  check(/outside the open folder/.test(outsideResult) && existsSync(outside), "file operations outside the open folder are refused");
  await screenshot("explorer-04-tree");

  // Browser tab beside the code.
  await click(".explorer .tree-row .tree-name", "a3.rkt");
  await waitFor(`${S}.getState().docs.some((d) => d.name === "a3.rkt")`, "a3.rkt to open");
  await key("Ctrl+Shift+B");
  await waitFor(`document.activeElement?.classList.contains("browser-address")`, "the address bar");
  await type(`localhost:${webPort}/index.html`);
  await key("Enter");
  await waitFor(`${S}.getState().webTabs.some((t) => t.title === "Assignment 3")`, "the page title", 30000);
  check(true, "a browser tab loads the assignment page and shows its title");
  const pageUrl = await connect((u) => u.includes(`localhost:${webPort}/index.html`));
  const page = await session(pageUrl);
  await sleep(500);
  check((await page.evaluate(`document.body.dataset.ipc`)) !== "allowed", `the web page cannot call PhDRacket (${await page.evaluate(`document.body.dataset.ipc`)})`);
  check((await page.evaluate(`document.visibilityState`)) === "visible", "the page is visible over its tab");
  await key("Ctrl+Shift+P");
  await waitFor(`document.querySelector(".quick-input")`, "the command palette");
  await sleep(400);
  check((await page.evaluate(`document.visibilityState`)) === "hidden", "the page hides while the command palette is open");
  await key("Escape");
  await sleep(600);
  check((await page.evaluate(`document.visibilityState`)) === "visible", "and comes back after");
  // A page opening a new window (as a target="_blank" link does), with a user gesture.
  await page.cdp("Runtime.evaluate", { expression: `window.open("/spec.html", "_blank")`, userGesture: true });
  await waitFor(`${S}.getState().webTabs.some((t) => t.title === "A3 Specification")`, "the new-window link as a tab", 30000);
  check(true, "a link that opens a new window opens a new browser tab");
  page.ws.close();
  await evaluate(`${S}.splitEditor("right")`);
  await screenshot("explorer-05-browser");
  const before = (await targets()).filter((t) => t.url.includes(`localhost:${webPort}`)).length;
  for (const t of await evaluate(`${S}.getState().webTabs.map((t) => t.id)`)) {
    const g = await evaluate(`Object.values(${S}.getState().layout.groups).find((g) => g.tabs.includes(${JSON.stringify(t)})).id`);
    await evaluate(`${S}.closeTab(${JSON.stringify(g)}, ${JSON.stringify(t)})`);
  }
  await sleep(1000);
  const after = (await targets()).filter((t) => t.url.includes(`localhost:${webPort}`)).length;
  check(before >= 2 && after === 0, `closing browser tabs closes their pages (${before} → ${after})`);

  // The cap toss: seven quick clicks on the mark.
  for (let i = 0; i < 7; i++) {
    const { x, y } = await point(".tossable-mark");
    for (const t of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x, y, button: "left", clickCount: 1 });
    await sleep(120);
  }
  await waitFor(`document.querySelector(".cap-toss")`, "the cap toss");
  await sleep(1400);
  await screenshot("explorer-06-cap-toss");
  check((await evaluate(`document.querySelector(".cap-toss-message").innerText`)).includes("Congratulations, Doctor."), "seven clicks on the mark toss the cap");
  await waitFor(`!document.querySelector(".cap-toss")`, "the celebration to end", 8000);
  check(true, "the celebration ends by itself");
} catch (e) {
  failures++;
  console.error(e);
  await screenshot("explorer-error").catch(() => {});
} finally {
  main.ws.close();
  app.kill();
  server.close();
}

console.log(failures === 0 ? "\nExplorer E2E test passed." : `\nExplorer E2E test: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
