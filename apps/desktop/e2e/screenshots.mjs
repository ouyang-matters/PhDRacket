// Takes the screenshots of docs/introducing-phdracket.md from the real app,
// at 1440 x 900, using the insertion-sort example in
// promo-screenshots/example-htdp-course.
//
//   pnpm dev                                   # in another terminal
//   node apps/desktop/e2e/screenshots.mjs [path-to-phdracket.exe]
//
// Windows only, like smoke.mjs. Writes docs/images/introducing/*.png.

import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outDir = join(repo, "docs/images/introducing");
mkdirSync(outDir, { recursive: true });
const exe =
  process.argv[2] ??
  join(process.env.CARGO_TARGET_DIR ?? join(repo, "target"), "debug", process.platform === "win32" ? "phdracket.exe" : "phdracket");
const port = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const work = join(tmpdir(), `phdracket-shots-${process.pid}`);
const course = join(work, "htdp-course");
cpSync(join(repo, "promo-screenshots/example-htdp-course"), course, { recursive: true });
const sort = join(course, "03-insertion-sort.rkt");
const terms = /^Last Updated: (.+)$/m.exec(readFileSync(join(repo, "docs/TERMS.md"), "utf8"))[1].trim();
const settings = join(work, "settings.json");
writeFileSync(settings, JSON.stringify({ workspaceFolder: course, ui: { setupDone: true, termsAccepted: terms, checkForUpdates: false, showAnnouncements: false, theme: "phd-dark", profile: "htdp", panelHeight: 330 } }));

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, WEBVIEW2_USER_DATA_FOLDER: join(work, "wv2"), PHDRACKET_SETTINGS_FILE: settings },
  stdio: "inherit",
});
let wsUrl;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p) => p.type === "page" && p.url.includes("localhost:1420"))?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(500);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) (pending.get(msg.id)(msg), pending.delete(msg.id));
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
const waitFor = async (expr, what, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`!!(${expr})`).catch(() => false)) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const shot = async (name) => {
  await sleep(600);
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
  console.log("wrote", name);
};
const S = "window.__phdracket";

try {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(`${S} && ${S}.getState().prefs.setupDone`, "the UI");
  await waitFor(`${S}.getState().runtime.state === "ready"`, "Racket");
  await waitFor(`!document.getElementById("splash")`, "the startup screen");
  await evaluate(`${S}.openPath(${JSON.stringify(sort)})`);
  await waitFor(`${S}.getState().docs.length === 1`, "the file");

  // Interactions: values, then a teaching-language error.
  await evaluate(`${S}.runActive()`);
  await waitFor(`${S}.getState().run.status === "ready" && ${S}.getState().run.tests`, "Run");
  await evaluate(`${S}.setPanel("interactions")`);
  for (const input of ["(sort> (cons 2 (cons 5 (cons 1 '()))))", "(insert 4 (cons 6 (cons 3 '())))", "(lambda (x) x)"]) {
    await evaluate(`${S}.evalInteraction(${JSON.stringify(input)})`);
    await waitFor(`${S}.getState().run.status === "ready"`, "interaction");
  }
  await shot("02-interactions");

  await evaluate(`${S}.setPanel("tests")`);
  await shot("03-tests");

  // Stepper: the step where the recursion has fully unfolded.
  await evaluate(`${S}.stepActive()`);
  await waitFor(`${S}.getState().stepper.status === "done"`, "the Stepper", 180000);
  const index = await evaluate(`(() => {
    const steps = ${S}.getState().stepper.steps;
    const i = steps.findIndex((s) => s.kind === "before-after" && s.after.some((e) => /insert 3 \\(insert 1 \\(insert 2/.test(e.text)));
    return i >= 0 ? i : Math.floor(steps.length / 3);
  })()`);
  await evaluate(`${S}.viewStep(${index})`);
  await shot("01-stepper-dark");

  await evaluate(`${S}.setPrefs({ theme: "phd-light" })`);
  await evaluate(`${S}.viewStep(${index + 6})`);
  await shot("04-stepper-light");

  // Split editors: one file on each side.
  await evaluate(`${S}.setPrefs({ theme: "phd-dark" })`);
  await evaluate(`${S}.openPath(${JSON.stringify(join(course, "04-word-count.rkt"))})`);
  await waitFor(`${S}.getState().docs.length === 2`, "the second file");
  // Left group: insertion sort; right group: word count.
  await evaluate(`${S}.splitEditor("right")`);
  await evaluate(`(() => { const s = ${S}.getState(); const left = Object.keys(s.layout.groups)[0]; ${S}.activateTab(left, s.docs[0].id); })()`);
  await evaluate(`${S}.setPanel("tests")`);
  await shot("05-workbench");

  // Settings > Appearance.
  await evaluate(`${S}.openSettings("appearance")`);
  await shot("06-themes");
  await evaluate(`${S}.setDialog(null)`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  ws.close();
  app.kill();
}
