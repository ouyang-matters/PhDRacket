// Pure functions for the Terms of Use (no bundler-specific imports), shared
// by the app and by apps/desktop/scripts/terms-txt.ts.

export type TermsBlock =
  | { kind: "title" | "heading" | "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/** Parses the small Markdown subset used by docs/TERMS.md. */
export function parseTerms(md: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  for (const chunk of md.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (lines[0].startsWith("## ")) blocks.push({ kind: "heading", text: lines[0].slice(3) });
    else if (lines[0].startsWith("# ")) blocks.push({ kind: "title", text: lines[0].slice(2) });
    else if (lines.every((l) => l.startsWith("* "))) blocks.push({ kind: "list", items: lines.map((l) => l.slice(2)) });
    else blocks.push({ kind: "paragraph", text: lines.map((l) => l.replace(/ {2}$/, "")).join("\n") });
  }
  return blocks;
}

/** Plain text for installers: headings in capitals, list items indented. */
export function termsToPlainText(md: string): string {
  const out: string[] = [];
  for (const b of parseTerms(md)) {
    if (b.kind === "list") out.push(b.items.map((i) => `  - ${i}`).join("\r\n"));
    else if (b.kind === "title") out.push(b.text.toUpperCase());
    else out.push(b.text.replace(/`/g, "").replace(/\n/g, "\r\n"));
  }
  return out.join("\r\n\r\n") + "\r\n";
}
