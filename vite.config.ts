import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = fileURLToPath(new URL("./apps/desktop", import.meta.url));

// The UI is served from apps/desktop; shared UI modules live in /frontend and
// /shared at the repository root.
export default defineConfig({
  root: appRoot,
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@frontend": fileURLToPath(new URL("./frontend", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 4096,
  },
  worker: { format: "es" },
});
