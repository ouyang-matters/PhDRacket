// End-to-end test of checking while typing (errors, unused names, scopes,
// Go to Definition, Rename, suggestions) and the debugger (breakpoints,
// stepping, variables, pause), in the real desktop app against the installed
// Racket. Keys and clicks are trusted input through the WebView2 DevTools
// protocol.
//
//   pnpm dev                                   # in another terminal
//   node apps/desktop/e2e/semantic.mjs [path-to-phdracket.exe]
//
// Windows only, like smoke.mjs. Screenshots go to apps/desktop/e2e/out/.

import { spawn } from "node:child_process";
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
const port = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failures++;
}

const work = join(tmpdir(), `phdracket-semantic-e2e-${process.pid}`);
const course = join(work, "CS145");
mkdirSync(course, { recursive: true });
const BSL = `#lang htdp/bsl
;; sq : Number -> Number
(define (sq x)
  (* x x))

(define (sum-sq a b)
  (+ (sq a) (sq b)))

(check-expect (sum-sq 3 4) 25)
`;
writeFileSync(join(course, "a3.rkt"), BSL);
writeFileSync(join(course, "loop.rkt"), `#lang racket\n(define (spin i)\n  (if (< i 0) i (spin (add1 i))))\n(spin 0)\n`);

const terms = /^Last Updated: (.+)$/m.exec(readFileSync(join(repo, "docs/TERMS.md"), "utf8"))[1].trim();
const settingsFile = join(work, "settings.json");
writeFileSync(settingsFile, JSON.stringify({ workspaceFolder: course, ui: { setupDone: true, termsAccepted: terms, checkForUpdates: false, showAnnouncements: false, theme: "phd-dark" } }));

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
const VK = { Enter: 13, Escape: 27, F2: 113, F6: 117, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123 };
async function key(combo) {
  const parts = combo.split("+");
  const k = parts.pop();
  const mods = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Ctrl") ? 2 : 0) | (parts.includes("Shift") ? 8 : 0);
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
  const vk = VK[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
  const name = k.length === 1 ? k.toLowerCase() : k;
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: mods, key: name, code, windowsVirtualKeyCode: vk });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", modifiers: mods, key: name, code, windowsVirtualKeyCode: vk });
  await sleep(200);
}
async function type(text) {
  await cdp("Input.insertText", { text });
  await sleep(150);
}

const S = "window.__phdracket";
const M = "window.__monaco";
const ED = `${M}.editor.getEditors().find((e) => e.getModel() && e.hasTextFocus !== undefined && e.getModel() === ${S}.getState().docs.find((d) => d.id === ${S}.getState().activeId)?.model)`;
const markers = (sev) => `${M}.editor.getModelMarkers({ owner: "phdracket.check" }).filter((m) => m.severity === ${sev})`;
const setText = (t) => evaluate(`(() => { const m = ${ED}.getModel(); m.pushEditOperations([], [{ range: m.getFullModelRange(), text: ${JSON.stringify(t)} }], () => null); })()`);
const at = (line, col) => evaluate(`(() => { const e = ${ED}; e.setPosition({ lineNumber: ${line}, column: ${col} }); e.focus(); })()`);

try {
  await waitFor(`${S} && ${S}.getState().runtime.state === "ready" && ${S}.getState().folder`, "Racket and the folder", 120000);
  await evaluate(`${S}.openPath(${JSON.stringify(join(course, "a3.rkt"))})`);
  await waitFor(`${ED}`, "the editor");

  // --- Check while typing --------------------------------------------------
  await waitFor(`(() => { const e = ${ED}; e.setPosition({ lineNumber: 4, column: 7 }); return ${M}.editor.getModelMarkers({ owner: "phdracket.check" }).length === 0 && true; })()`, "the first check");
  await sleep(2500);
  check((await evaluate(`${markers(8)}.length`)) === 0, "a correct program has no errors");

  await setText(BSL.replace("(sq b)", "(sqr b)").replace("(sq a)", "(sq a z)"));
  await waitFor(`${markers(8)}.length > 0`, "an error marker", 20000);
  const err = await evaluate(`${markers(8)}[0]`);
  check(/not defined|expects|z/.test(err.message), `an error appears while typing: "${err.message}" at line ${err.startLineNumber}`);
  await sleep(300);
  await screenshot("semantic-01-error");
  const badge = await evaluate(`[...document.querySelectorAll(".panel-tabs button")].find((b) => b.textContent.includes("Problems"))?.textContent`);
  check(/\d/.test(badge ?? ""), `the Problems tab counts it (${badge})`);

  await setText(BSL.replace("(define (sq x)\n  (* x x))", "(define (sq x)\n  (local [(define unused 1)] (* x x)))").replace("#lang htdp/bsl", "#lang htdp/isl"));
  await waitFor(`${markers(8)}.length === 0 && ${markers(1)}.length > 0`, "the error to clear and a hint for the unused name", 20000);
  check((await evaluate(`${markers(1)}[0].message`)) === "unused is never used", "an unused local name is marked (faded)");

  await setText(BSL);
  await waitFor(`${markers(8)}.length === 0 && ${markers(1)}.length === 0`, "the program to check clean again", 20000);
  await sleep(800);

  // --- Scopes: Go to Definition, Rename ------------------------------------
  await at(7, 8); // the `sq` in (sq a)
  await evaluate(`${ED}.trigger("e2e", "editor.action.revealDefinition", {})`);
  await sleep(500);
  const pos = await evaluate(`${ED}.getPosition()`);
  check(pos.lineNumber === 3, `Go to Definition jumps to (define (sq x) …) (line ${pos.lineNumber})`);

  await at(3, 13); // the parameter x
  await evaluate(`${ED}.trigger("e2e", "editor.action.rename", {})`);
  await waitFor(`document.activeElement === document.querySelector(".rename-box input") && document.activeElement.value === "x"`, "the rename box with focus");
  await evaluate(`(() => { const i = document.querySelector(".rename-box input"); i.select(); })()`);
  await type("n");
  await key("Enter");
  await sleep(800);
  const renamed = await evaluate(`${ED}.getModel().getValue()`);
  check(renamed.includes("(define (sq n)\n  (* n n))") && renamed.includes("(+ (sq a) (sq b))"), `Rename changes the parameter and its uses only${renamed.includes("(define (sq n)") ? "" : ` (got ${JSON.stringify(renamed.split(String.fromCharCode(10)).slice(2, 7).join(" / "))})`}`);
  await setText(BSL);
  await waitFor(`${markers(8)}.length === 0`, "check after undoing the rename", 20000);
  await sleep(1500);

  // --- Suggestions -----------------------------------------------------------
  await at(10, 1);
  await type("(su");
  await waitFor(`document.querySelector(".suggest-widget.visible .monaco-list-row")`, "the suggestion list", 10000);
  const sugg = await evaluate(`[...document.querySelectorAll(".suggest-widget.visible .monaco-list-row")].map((r) => r.getAttribute("aria-label") || r.textContent)`);
  check(sugg.some((s) => s.includes("sum-sq")), `suggests the program's own name sum-sq (${sugg.slice(0, 4).join(" | ")})`);
  await key("Escape");
  await type("bstring");
  await sleep(300);
  await evaluate(`${ED}.trigger("e2e", "editor.action.triggerSuggest", {})`);
  await waitFor(`document.querySelector(".suggest-widget.visible .monaco-list-row")`, "language suggestions", 10000);
  const lang = await evaluate(`[...document.querySelectorAll(".suggest-widget.visible .monaco-list-row")].map((r) => r.getAttribute("aria-label") || r.textContent)`);
  check(lang.some((s) => s.includes("substring")), `suggests the language's names (${lang.slice(0, 3).join(" | ")})`);
  await screenshot("semantic-02-suggest");
  await key("Escape");
  await setText(BSL);
  await sleep(500);

  // --- Debugger --------------------------------------------------------------
  await at(4, 3);
  await key("F9");
  check(JSON.stringify(await evaluate(`[...document.querySelectorAll(".phd-breakpoint")].length`)) !== "0", "F9 sets a breakpoint (red dot in the margin)");
  await key("F6");
  await waitFor(`document.querySelector(".debug-panel .debug-vars")`, "the program to pause at the breakpoint", 60000);
  const vars = await evaluate(`document.querySelector(".debug-vars").innerText`);
  check(/x\s+3/.test(vars), `paused inside sq with x = 3 (${vars.replace(/\s+/g, " ")})`);
  const status = await evaluate(`document.querySelector(".debug-status").innerText`);
  check(/Paused before .*on line 4/.test(status), `the Debug panel says where (${status})`);
  check(await evaluate(`!!document.querySelector(".phd-paused-expr")`), "the paused expression is highlighted");
  await screenshot("semantic-03-paused");
  await key("F10");
  await waitFor(`/Paused after/.test(document.querySelector(".debug-status")?.innerText ?? "")`, "Step Over to show the value", 20000);
  const after = await evaluate(`document.querySelector(".debug-status").innerText`);
  check(/⇒\s*9/.test(after), `Step Over shows the value: ${after}`);
  check((await evaluate(`document.querySelector(".phd-paused-value")?.textContent ?? ""`)).includes("9"), "the value also appears in the editor");
  await screenshot("semantic-04-after");
  // Remove the breakpoint and continue to the end.
  await evaluate(`[...document.querySelectorAll(".debug-list button[aria-label='Remove breakpoint']")].forEach((b) => b.click())`);
  await key("F5");
  await waitFor(`/finished/.test(document.querySelector(".debug-status")?.innerText ?? "")`, "the program to finish", 30000);
  const out = await evaluate(`document.querySelector(".interactions")?.innerText ?? ""`);
  check(/1 test|test passed|All tests passed|The test passed/i.test(out) || (await evaluate(`${S}.getState().run.tests?.total`)) === 1, "the program ran to the end with its test");

  // Pause a running program.
  await evaluate(`${S}.openPath(${JSON.stringify(join(course, "loop.rkt"))})`);
  await waitFor(`${S}.getState().docs.some((d) => d.name === "loop.rkt") && ${ED}`, "loop.rkt");
  await sleep(500);
  await key("F6");
  await sleep(1500);
  await key("F6");
  await waitFor(`document.querySelector(".debug-panel .debug-vars")`, "Pause to stop the loop", 20000);
  const loopVars = await evaluate(`document.querySelector(".debug-vars").innerText`);
  check(/i\s+\d+/.test(loopVars), `Pause stops a running loop (${loopVars.replace(/\s+/g, " ")})`);
  await screenshot("semantic-05-pause");
  await key("Shift+F5");
  await waitFor(`/Not debugging/.test(document.querySelector(".debug-status")?.innerText ?? "")`, "Stop to end debugging", 20000);
  check(true, "Stop ends the debug session");
} catch (e) {
  failures++;
  console.error(e);
  await screenshot("semantic-error").catch(() => {});
} finally {
  ws.close();
  app.kill();
}

console.log(failures === 0 ? "\nSemantic E2E test passed." : `\nSemantic E2E test: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
