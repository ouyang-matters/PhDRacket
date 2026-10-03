// The PhDRacket Beta Terms of Use. docs/TERMS.md is the only source: the app
// shows it in Setup and About, and the Windows installer shows the plain-text
// copy generated from it by `pnpm terms` (apps/desktop/src-tauri/TERMS.txt).

import termsMarkdown from "../../docs/TERMS.md?raw";

export { parseTerms, termsToPlainText, type TermsBlock } from "./terms-core";

export const TERMS_MARKDOWN: string = termsMarkdown.replace(/\r\n?/g, "\n");

/** The "Last Updated" date. Accepting the Terms records this version, and a
 * new date asks the user to accept again. */
export const TERMS_VERSION: string = /^Last Updated: (.+)$/m.exec(TERMS_MARKDOWN)?.[1]?.trim() ?? "unknown";
