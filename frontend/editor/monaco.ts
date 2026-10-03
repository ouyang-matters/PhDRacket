// Monaco, loaded locally (never from a CDN), with editor features but none of
// Monaco's bundled language services.

import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { registerRacketLanguage } from "./racket-language";

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(id: string, label: string): Worker };
  }
}

window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

registerRacketLanguage(monaco);

// Restrained palettes; strings, comments and test forms are the most
// distinguishable categories because they matter most when reading code.
monaco.editor.defineTheme("phd-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a737d", fontStyle: "italic" },
    { token: "comment.datum", foreground: "6a737d" },
    { token: "string", foreground: "0b7a3b" },
    { token: "string.char", foreground: "0b7a3b" },
    { token: "string.escape", foreground: "8a6d00" },
    { token: "regexp", foreground: "8a6d00" },
    { token: "number", foreground: "1c5fb0" },
    { token: "constant.language", foreground: "1c5fb0" },
    { token: "keyword", foreground: "7a1fa2" },
    { token: "keyword.test", foreground: "a8420f", fontStyle: "bold" },
    { token: "keyword.hash", foreground: "7a1fa2" },
    { token: "entity.name.function", foreground: "1d3f8a", fontStyle: "bold" },
    { token: "type", foreground: "8a5100", fontStyle: "bold" },
    { token: "metatag", foreground: "8c8c8c" },
    { token: "operator.quote", foreground: "a8420f" },
    { token: "identifier", foreground: "1f2328" },
  ],
  colors: {
    "editor.background": "#fcfcfb",
    "editorLineNumber.foreground": "#9da3ab",
    "editorLineNumber.activeForeground": "#3c4043",
    "editorBracketMatch.background": "#d7e3f7",
    "editorBracketMatch.border": "#7d9fd6",
    "editor.lineHighlightBackground": "#f2f2ef",
  },
});

monaco.editor.defineTheme("phd-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8b949e", fontStyle: "italic" },
    { token: "comment.datum", foreground: "8b949e" },
    { token: "string", foreground: "8fd19e" },
    { token: "string.char", foreground: "8fd19e" },
    { token: "string.escape", foreground: "e3c47a" },
    { token: "regexp", foreground: "e3c47a" },
    { token: "number", foreground: "8cb8ff" },
    { token: "constant.language", foreground: "8cb8ff" },
    { token: "keyword", foreground: "d2a8ff" },
    { token: "keyword.test", foreground: "ffa66b", fontStyle: "bold" },
    { token: "keyword.hash", foreground: "d2a8ff" },
    { token: "entity.name.function", foreground: "9ecbff", fontStyle: "bold" },
    { token: "type", foreground: "f0b860", fontStyle: "bold" },
    { token: "metatag", foreground: "7d8590" },
    { token: "operator.quote", foreground: "ffa66b" },
    { token: "identifier", foreground: "e6edf3" },
  ],
  colors: {
    "editor.background": "#16181c",
    "editorLineNumber.foreground": "#5c636e",
    "editorLineNumber.activeForeground": "#c9d1d9",
    "editorBracketMatch.background": "#2b3b55",
    "editorBracketMatch.border": "#5d82c2",
    "editor.lineHighlightBackground": "#1e2126",
  },
});

/** Rainbow parentheses are a per-model option in standalone Monaco (the
 * editor-level option does not reach models), so apply it to every model. */
export function applyBracketColorization(enabled: boolean, model?: monaco.editor.ITextModel) {
  for (const m of model ? [model] : monaco.editor.getModels()) {
    m.updateOptions({ bracketColorizationOptions: { enabled, independentColorPoolPerBracketType: false } });
  }
}

let currentRainbow = false;
monaco.editor.onDidCreateModel((m) => applyBracketColorization(currentRainbow, m));

export function setRainbowBrackets(enabled: boolean) {
  currentRainbow = enabled;
  applyBracketColorization(enabled);
}

export { monaco };
