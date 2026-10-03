import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@frontend": fileURLToPath(new URL("./frontend", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["frontend/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
