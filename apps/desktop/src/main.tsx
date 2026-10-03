import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@frontend/app/App";
import "@frontend/app/styles.css";
import * as store from "@frontend/app/store";

// Development builds expose the store for the end-to-end tests (apps/desktop/e2e).
if (import.meta.env.DEV) {
  (window as unknown as { __phdracket: typeof store }).__phdracket = store;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
