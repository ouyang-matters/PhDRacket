// Writes apps/desktop/src-tauri/TERMS.txt (UTF-8, no byte-order mark: Tauri
// adds one when it embeds the file) from docs/TERMS.md
// for the Windows installer's license page. Run with: pnpm terms
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { termsToPlainText } from "../../../frontend/legal/terms-core.ts";

const md = readFileSync(fileURLToPath(new URL("../../../docs/TERMS.md", import.meta.url)), "utf8").replace(/\r\n?/g, "\n");
const out = fileURLToPath(new URL("../src-tauri/TERMS.txt", import.meta.url));
writeFileSync(out, termsToPlainText(md), "utf8");
console.log(`wrote ${out}`);
