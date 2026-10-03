// The startup screen (apps/desktop/index.html), shown while the workbench
// loads. It never delays startup and never loops.
//
// This is a file, not inline code, on purpose: Tauri adds hashes of inline
// code to the Content-Security-Policy, and when hashes are present browsers
// ignore 'unsafe-inline', which would block the <style> elements Monaco
// creates at runtime (token colors, menus, decorations).
//
// It reads the last theme and the Startup animation setting (written by
// frontend/theme/apply.ts and frontend/app/App.tsx) and leaves on the
// workbench's "phdracket-ready" event.
(function () {
  var splash = document.getElementById("splash");
  var theme = null;
  var mode = "full";
  try {
    theme = JSON.parse(localStorage.getItem("phdracket.splash") || "null");
    mode = localStorage.getItem("phdracket.startupAnimation") || "full";
  } catch (e) {
    // Storage unavailable: defaults.
  }
  var root = document.documentElement.style;
  if (theme) {
    root.setProperty("--splash-bg", theme.bg);
    root.setProperty("--splash-fg", theme.fg);
    root.setProperty("--splash-accent", theme.accent);
  } else if (window.matchMedia && !window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setProperty("--splash-bg", "#f6f6f3");
    root.setProperty("--splash-fg", "#1f2328");
    root.setProperty("--splash-accent", "#1f5fae");
  }
  if (mode === "full" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) mode = "reduced";

  if (mode === "off") {
    splash.remove();
    return;
  }
  splash.classList.add(mode === "reduced" ? "reduced" : "full");
  // If loading takes long, say so quietly instead of replaying anything.
  var slow = setTimeout(function () {
    splash.classList.add("slow");
  }, 1500);
  window.addEventListener(
    "phdracket-ready",
    function () {
      clearTimeout(slow);
      splash.classList.add("leaving");
      setTimeout(function () {
        splash.remove();
      }, 200);
    },
    { once: true },
  );
})();
