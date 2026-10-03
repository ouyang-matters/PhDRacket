import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@frontend/app/App";
import "@frontend/app/styles.css";
import "@frontend/workbench/workbench.css";
import { applyTheme } from "@frontend/theme/apply";
import { resolveThemeChoice } from "@frontend/theme/engine";
import { installCompute } from "@frontend/compute/install";
import * as store from "@frontend/app/store";

// Development builds expose the store for the end-to-end tests (apps/desktop/e2e).
if (import.meta.env.DEV) {
  (window as unknown as { __phdracket: typeof store }).__phdracket = store;
}

// The system theme until settings load, so the first frame is already themed.
applyTheme(resolveThemeChoice("system", window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
installCompute();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
