// End-to-end smoke test of the real desktop app.
//
// Launches the debug build of PhDRacket with WebView2 remote debugging
// enabled, drives the UI through the store exposed in development builds,
// and checks the MVP 0 workflow against the installed official Racket:
// open → Run → Interactions → stale-definitions banner → Run reset → save.
//
//   pnpm dev                      # in another terminal (serves the UI)
//   node apps/desktop/e2e/smoke.mjs [path-to-phdracket.exe]
//
// Windows only for now (WebView2's DevTools endpoint). Screenshots are
// written to apps/desktop/e2e/out/.

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
const port = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

let failures = 0;
function check(cond, what) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failures++;
}

const app = spawn(exe, [], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    // Keep the user's real settings (recent files, preferences) untouched.
    PHDRACKET_SETTINGS_FILE: join(tmpdir(), `phdracket-e2e-settings-${process.pid}.json`),
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
function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}
async function evaluate(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function waitFor(expr, what, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(expr).catch(() => false)) return true;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function screenshot(name) {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
const S = "window.__phdracket";
const state = (path) => evaluate(`JSON.parse(JSON.stringify(${S}.getState().${path}))`);

try {
  await waitFor(`!!${S}`, "the UI");
  await waitFor(`${S}.getState().runtime.state === "ready"`, "Racket to be ready", 120000);
  const rt = await state("runtime.runtime");
  check(rt.version.length > 0, `runtime detected: Racket ${rt.version} at ${rt.executable}`);

  // First launch (fresh settings): Setup opens with clean defaults.
  await waitFor(`${S}.getState().dialog === "setup"`, "the Setup dialog");
  await sleep(500);
  await screenshot("00-setup");
  const setupButton = await evaluate(`document.querySelector(".setup .primary")?.textContent`);
  check(setupButton === "Finish", `Setup offers "${setupButton}" when Racket ${rt.version} is installed`);
  await evaluate(`document.querySelector(".setup .primary").click()`);
  await waitFor(`${S}.getState().dialog === null && ${S}.getState().prefs.setupDone`, "Setup to finish");
  check(true, "Setup finishes and is remembered");
  await screenshot("01-start");

  // Work on a copy of a corpus file.
  const work = join(tmpdir(), `phdracket-e2e-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const file = join(work, "basics.rkt");
  copyFileSync(join(repo, "compatibility-tests/corpus/bsl/basics.rkt"), file);
  const before = sha(file);

  // Open Folder, then open the file from the Explorer.
  await evaluate(`${S}.setFolder(${JSON.stringify(work)})`);
  await waitFor(`[...document.querySelectorAll(".tree-row")].some((b) => b.textContent === "basics.rkt")`, "the Explorer listing");
  await evaluate(`[...document.querySelectorAll(".tree-row")].find((b) => b.textContent === "basics.rkt").click()`);
  await waitFor(`${S}.getState().docs.length === 1`, "the document to open");
  check(await evaluate(`!!document.querySelector(".tree-row.active")`), "Explorer opens files and marks the active one");
  check((await state("docs[0].language.name")) === "Beginning Student", "language detected as Beginning Student");

  await evaluate(`${S}.runActive()`);
  await waitFor(`${S}.getState().run.status === "ready"`, "the Run to finish");
  const values = (await state("run.transcript")).filter((e) => e.kind === "value").map((e) => e.text);
  check(values[0] === "2" && values.includes('"hello"'), `Definitions printed values: ${values.join(", ")}`);
  const tests = await state("run.tests");
  check(tests.total === 4 && tests.failed === 1, `test engine: ${tests.total} tests, ${tests.failed} failed`);
  await screenshot("02-after-run");

  await evaluate(`${S}.evalInteraction("(define z 41)")`);
  await waitFor(`${S}.getState().run.status === "ready"`, "interaction");
  await evaluate(`${S}.evalInteraction("(+ z 1)")`);
  await waitFor(`${S}.getState().run.status === "ready" && ${S}.getState().run.transcript.at(-1).kind === "value"`, "interaction value");
  check((await state("run.transcript")).at(-1).text === "42", "Interactions see definitions made there");

  await evaluate(`${S}.evalInteraction("(lambda (x) x)")`);
  await waitFor(`${S}.getState().run.status === "ready" && ${S}.getState().run.transcript.at(-1).kind === "error"`, "BSL error");
  const err = (await state("run.transcript")).at(-1);
  check(err.diagnostic.category === "syntax" && /lambda/.test(err.text), `BSL rejects lambda in Interactions: ${err.text}`);
  await evaluate(`${S}.setPanel("interactions")`);
  await screenshot("03-interactions");

  // Edit Definitions: Interactions must say they are stale; save must keep the header.
  await evaluate(`(() => { const m = ${S}.getState().docs[0].model; m.pushEditOperations([], [{ range: m.getFullModelRange().collapseToEnd(), text: "\\n(define added 1)\\n" }], () => null); })()`);
  await sleep(300);
  const bannerShown = await evaluate(`document.body.innerText.includes("Definitions changed")`);
  check(bannerShown, "stale-Interactions banner appears after editing Definitions");
  await screenshot("04-stale-banner");

  await evaluate(`${S}.runActive()`);
  await waitFor(`${S}.getState().run.status === "ready"`, "the second Run");
  await evaluate(`${S}.evalInteraction("z")`);
  await waitFor(`${S}.getState().run.status === "ready" && ${S}.getState().run.transcript.at(-1).kind === "error"`, "z to be unbound");
  check(/z/.test((await state("run.transcript")).at(-1).text), "Run discarded the old Interactions (z is gone)");

  // Undo the edit and save: the file must be byte-identical.
  await evaluate(`(() => { const m = ${S}.getState().docs[0].model; while (m.canUndo()) m.undo(); })()`);
  await evaluate(`${S}.saveDoc()`);
  await sleep(500);
  check(sha(file) === before, "saving the unedited document leaves the file byte-identical");

  // Stepper: official HtDP stepper, full history, navigation.
  await evaluate(`${S}.stepActive()`);
  await waitFor(`${S}.getState().stepper.status === "done"`, "the Stepper", 120000);
  const stepper = await state("stepper");
  check(stepper.steps.length > 3 && stepper.steps[0].kind === "before-after", `Stepper produced ${stepper.steps.length} steps`);
  await evaluate(`${S}.viewStep(2)`);
  check((await state("stepper.index")) === 2, "Stepper navigates to a step");
  await sleep(300);
  check(await evaluate(`!!document.querySelector(".phd-step-source")`), "current step's source is highlighted in the editor");
  await screenshot("05-stepper");

  // Mode switching must not touch the source.
  const text = await evaluate(`${S}.getState().docs[0].model.getValue()`);
  for (const p of ["racket", "htdp", "waterloo-cs135", "waterloo-cs145"]) {
    await evaluate(`${S}.setPrefs({ profile: "${p}" })`);
    await sleep(150);
  }
  check(sha(file) === before && (await evaluate(`${S}.getState().docs[0].model.getValue()`)) === text,
    "switching CS145 / HtDP / Racket modes leaves the file and editor text unchanged");

  // Choose Language: an explicit, undoable edit of the declaration only.
  await evaluate(`${S}.changeLanguage("intermediate")`);
  check((await state("docs[0].language.name")) === "Intermediate Student", "Choose Language switches the editor to Intermediate Student");
  await evaluate(`${S}.runActive()`);
  await waitFor(`${S}.getState().run.status === "ready"`, "Run after changing language");
  check((await state("run.language.name")) === "Intermediate Student", "Racket runs the program in the chosen language");
  await screenshot("06-language");
  await evaluate(`${S}.getState().docs[0].model.undo()`);
  await sleep(200);
  check((await state("docs[0].language.name")) === "Beginning Student", "undo restores the original language");
  check(sha(file) === before, "changing the language does not touch the file until it is saved");

  await evaluate(`${S}.setPrefs({ theme: "dark" })`);
  await sleep(300);
  await screenshot("07-dark");
  await evaluate(`${S}.setPrefs({ theme: "system" })`);
} catch (e) {
  failures++;
  console.error(e);
  await screenshot("error").catch(() => {});
} finally {
  ws.close();
  app.kill();
}

console.log(failures === 0 ? "\nE2E smoke test passed." : `\nE2E smoke test: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
