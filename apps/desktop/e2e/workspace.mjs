// End-to-end test of the Outline, source control (Git) and the highlighting
// settings, in the real desktop app. Uses a temporary Git repository.
//
//   pnpm dev                                   # in another terminal
//   node apps/desktop/e2e/workspace.mjs [path-to-phdracket.exe]
//
// Windows only, like smoke.mjs. Needs git on PATH. Screenshots go to
// apps/desktop/e2e/out/.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const port = 9340;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failures++;
}

const work = join(tmpdir(), `phdracket-workspace-e2e-${process.pid}`);
const course = join(work, "CS145");
mkdirSync(course, { recursive: true });
const A3 = `#lang htdp/bsl
;;; Question 1

;; sq : Number -> Number
(define (sq x)
  (* x x))

(define-struct point (x y))

(check-expect (sq 3) 9)
(check-expect (sq 2) 5)
`;
writeFileSync(join(course, "a3.rkt"), A3);
const git = (...args) => execFileSync("git", ["-C", course, ...args], { encoding: "utf8" });
git("init", "-q");
git("config", "user.email", "student@example.com");
git("config", "user.name", "Student");
git("config", "core.autocrlf", "false");
git("add", "-A");
git("commit", "-q", "-m", "Start A3");

const terms = /^Last Updated: (.+)$/m.exec(readFileSync(join(repo, "docs/TERMS.md"), "utf8"))[1].trim();
const settingsFile = join(work, "settings.json");
writeFileSync(settingsFile, JSON.stringify({ workspaceFolder: course, ui: { setupDone: true, termsAccepted: terms, checkForUpdates: false, showAnnouncements: false, theme: "phd-dark" } }));

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, WEBVIEW2_USER_DATA_FOLDER: join(work, "webview2"), PHDRACKET_SETTINGS_FILE: settingsFile },
  stdio: "inherit",
});

async function connect() {
  for (let i = 0; i < 120; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p) => p.type === "page" && p.url.includes("localhost:1420"));
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
  if (msg.id && pending.has(msg.id)) (pending.get(msg.id)(msg), pending.delete(msg.id));
});
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
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
async function click(selector, text) {
  const box = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${text ? `e.textContent.trim().includes(${JSON.stringify(text)})` : "true"});
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing at ${selector} ${text ?? ""}`);
  for (const t of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(200);
}

const S = "window.__phdracket";
const M = "window.__monaco";
const ED = `${M}.editor.getEditors().find((e) => e.getModel() === ${S}.getState().docs.find((d) => d.name === "a3.rkt")?.model && !e.getModel().uri.toString().includes("inmemory"))`;

try {
  await waitFor(`${S} && ${S}.getState().runtime.state === "ready" && ${S}.getState().folder`, "Racket and the folder", 120000);
  await evaluate(`${S}.openPath(${JSON.stringify(join(course, "a3.rkt"))})`);
  await waitFor(`${ED}`, "the editor");

  // --- Outline ---------------------------------------------------------------
  await evaluate(`${S}.setPrefs({ sidebarView: "outline", explorerVisible: true })`);
  await waitFor(`document.querySelectorAll(".outline-row").length >= 5`, "the outline");
  const rows = await evaluate(`[...document.querySelectorAll(".outline-row")].map((r) => r.textContent.replace(/\\s+/g, " ").trim())`);
  check(rows[0].includes("Question 1") && rows.some((r) => r.startsWith("sq") && r.includes("Number -> Number")) && rows.some((r) => r.startsWith("point")), `the outline lists the section, sq with its signature, and point (${rows.slice(0, 4).join(" | ")})`);
  check(rows.some((r) => r.includes("x") && rows.indexOf(r) > rows.findIndex((q) => q.startsWith("point"))), "the structure's fields are listed under it");
  await click(".outline-row", "point");
  check((await evaluate(`${ED}.getPosition().lineNumber`)) === 8, "clicking an item goes to its definition");
  // Edits update the outline.
  await evaluate(`(() => { const m = ${ED}.getModel(); m.pushEditOperations([], [{ range: { startLineNumber: 9, startColumn: 1, endLineNumber: 9, endColumn: 1 }, text: "(define (cube y) (* y y y))\\n" }], () => null); })()`);
  await waitFor(`[...document.querySelectorAll(".outline-row")].some((r) => r.innerText.startsWith("cube"))`, "the outline to show the new definition", 5000);
  check(true, "the outline updates while typing");
  // Tests: run, then one passes and one fails.
  await evaluate(`${S}.runActive()`);
  await waitFor(`document.querySelector(".outline-badge.fail") && document.querySelector(".outline-badge.pass")`, "test results in the outline", 60000);
  check(true, "the outline shows which tests passed and failed in the last Run");
  await screenshot("workspace-01-outline");

  // --- Source control --------------------------------------------------------
  const branchText = `(document.querySelector(".status-bar")?.innerText ?? "")`;
  await waitFor(`${branchText}.includes("master") || ${branchText}.includes("main")`, "the branch in the status bar", 20000);
  check(true, "the status bar shows the branch");
  await waitFor(`${ED}.getModel().getAllDecorations().some((d) => d.options.linesDecorationsClassName === "git-added")`, "an added-line marker", 20000);
  check(true, "the added line is marked in the margin (before saving)");
  await evaluate(`${S}.saveDoc()`);
  await waitFor(`${branchText}.includes("master*") || ${branchText}.includes("main*")`, "the branch marked as changed", 20000);
  check(true, "after saving, the branch is marked as changed");
  await evaluate(`${S}.setPrefs({ sidebarView: "explorer" })`);
  await waitFor(`[...document.querySelectorAll(".tree-row.git-M")].some((r) => r.innerText.includes("a3.rkt"))`, "the Explorer to color the changed file", 20000);
  check(true, "the Explorer shows a3.rkt as modified (M)");

  await evaluate(`${S}.setPrefs({ sidebarView: "scm" })`);
  await waitFor(`[...document.querySelectorAll(".scm-file")].some((r) => r.innerText.includes("a3.rkt"))`, "the change in Source Control", 20000);
  await click(".scm-file-main", "a3.rkt");
  await waitFor(`document.querySelector(".diff-view .diff-bar")?.innerText.includes("1 change")`, "the diff tab", 20000);
  check(true, "clicking a change opens a diff against the last commit (1 change)");
  await screenshot("workspace-02-diff");
  // The row's buttons appear on hover.
  const rowBox = await evaluate(`(() => { const r = [...document.querySelectorAll(".scm-file")].find((e) => e.innerText.includes("a3.rkt")).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: rowBox.x, y: rowBox.y });
  await sleep(200);
  await click(".scm-file .icon-button[aria-label='Stage']");
  await waitFor(`[...document.querySelectorAll(".scm-section-head")].some((h) => h.textContent.includes("Staged Changes"))`, "the file to be staged", 20000);
  check(git("diff", "--cached", "--name-only").trim() === "a3.rkt", "Stage stages the file");
  await evaluate(`(() => { const t = document.querySelector(".scm-commit-box textarea"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Add cube"); t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(200);
  await click(".scm-commit-box button.primary");
  await waitFor(`!document.querySelector(".scm-file")`, "the commit to finish", 20000);
  check(git("log", "-1", "--format=%s").trim() === "Add cube" && git("status", "--porcelain").trim() === "", "Commit records the change; nothing is left to commit");
  await waitFor(`document.querySelector(".diff-view .diff-bar")?.innerText.includes("No differences")`, "the open diff to follow the new commit", 20000);
  check(true, "an open diff follows the new commit (no differences left)");
  await click(".scm-section-head", "History");
  await waitFor(`[...document.querySelectorAll(".scm-subject")].map((e) => e.textContent).join("|") === "Add cube|Start A3"`, "the history", 20000);
  check(true, "History lists both commits");
  await screenshot("workspace-03-scm");

  // --- Highlighting settings --------------------------------------------------
  await evaluate(`${S}.setPrefs({ inlineErrors: true })`);
  await evaluate(`(() => { const m = ${ED}.getModel(); m.pushEditOperations([], [{ range: { startLineNumber: 6, startColumn: 1, endLineNumber: 6, endColumn: 11 }, text: "  (* x z))" }], () => null); })()`);
  // Back to the file's own tab (the diff tab is in front).
  await evaluate(`(() => { const st = ${S}.getState(); const d = st.docs.find((x) => x.name === "a3.rkt"); const g = Object.values(st.layout.groups).find((g) => g.tabs.includes(d.id)); ${S}.activateTab(g.id, d.id); })()`);
  try {
    // A covered window may not repaint by itself: ask the editor to render.
    await waitFor(`(${ED}.render(true), document.querySelector(".phd-inline-error"))`, "the inline error message", 30000);
  } catch (e) {
    console.log("DEBUG", JSON.stringify(await evaluate(`(() => { const m = ${ED}.getModel(); return { active: ${S}.getState().activeId, docs: ${S}.getState().docs.map((d) => d.id + ":" + d.name), markers: ${M}.editor.getModelMarkers({ owner: "phdracket.check" }).map((x) => x.message + "@" + x.startLineNumber), after: m.getAllDecorations().filter((d) => d.options.after).map((d) => [d.options.after.content, JSON.stringify(d.range)]), line6: m.getLineContent(6), views: [...document.querySelectorAll(".view-line")].length, editors: ${M}.editor.getEditors().map((e) => [e.getModel()?.uri.toString(), JSON.stringify(e.getLayoutInfo().height), e.getDomNode()?.offsetHeight, JSON.stringify(e.getVisibleRanges())]), ed: [${ED}.getLayoutInfo().height, ${ED}.getDomNode().isConnected, ${ED}.getDomNode().offsetHeight] }; })()`)));
    throw e;
  }
  check((await evaluate(`document.querySelector(".phd-inline-error").textContent`)).includes("z"), "errors can be shown at the end of the line");
  await evaluate(`${S}.setPrefs({ highlightCurrentLine: false, highlightOccurrences: false, stickyDefinitions: true })`);
  await sleep(300);
  const opts = await evaluate(`(() => { const o = ${ED}.getRawOptions(); return [o.renderLineHighlight, o.occurrencesHighlight, o.stickyScroll.enabled]; })()`);
  check(JSON.stringify(opts) === JSON.stringify(["none", "off", true]), `highlighting settings apply to the editor (${opts})`);
  await evaluate(`${S}.setPrefs({ gitGutter: false })`);
  await waitFor(`!${ED}.getModel().getAllDecorations().some((d) => /^git-/.test(d.options.linesDecorationsClassName ?? ""))`, "margin markers to go away", 10000);
  check(true, "the margin markers can be turned off");
  await evaluate(`${S}.openSettings("editor")`);
  await sleep(400);
  await screenshot("workspace-04-settings");
} catch (e) {
  failures++;
  console.error(e);
  await screenshot("workspace-error").catch(() => {});
} finally {
  ws.close();
  app.kill();
}

console.log(failures === 0 ? "\nWorkspace E2E test passed." : `\nWorkspace E2E test: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
