// Racket syntax highlighting for Monaco.
//
// This is lexical coloring only. Highlighting a word never means the active
// language permits it: whether a construct is allowed is decided solely by
// the Racket runtime when the program runs.

import type * as Monaco from "monaco-editor/editor/editor.api";

export const RACKET_LANGUAGE_ID = "racket";

/** Core and teaching-language syntactic forms (colored as keywords). */
export const SPECIAL_FORMS = [
  "define", "define-struct", "define-values", "define-syntax", "define-syntax-rule",
  "define-datatype", "lambda", "λ", "local", "let", "let*", "letrec", "let-values",
  "cond", "else", "if", "and", "or", "when", "unless", "begin", "begin0", "set!",
  "quote", "quasiquote", "unquote", "unquote-splicing", "require", "provide",
  "case", "match", "match-define", "struct", "module", "module+", "module*",
  "shared", "time", "for", "for/list", "for/fold", "for*", "for*/list",
  "parameterize", "with-handlers", "case-lambda", "do", "delay", "assert",
];

/** HtDP / RackUnit-style test forms. */
export const TEST_FORMS = [
  "check-expect", "check-within", "check-error", "check-member-of", "check-range",
  "check-satisfied", "check-random", "check-property", "check-equal?", "check-true",
  "check-false", "test-case", "test",
];

/** Forms whose next identifier (or the head of the next list) is a definition. */
const DEFINING_FORMS = ["define", "define-values", "define-syntax", "define-syntax-rule"];
const STRUCT_FORMS = ["define-struct", "struct"];

const DELIM = "[\\s()\\[\\]{}\",'`;]";
const IDENT = "[^\\s()\\[\\]{}\",'`;|#][^\\s()\\[\\]{}\",'`;]*|\\|[^|]*\\|";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRegex(words: string[]): RegExp {
  return new RegExp(`(?:${words.map(escape).join("|")})(?=${DELIM}|$)`);
}

export const languageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: ";", blockComment: ["#|", "|#"] },
  brackets: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  autoClosingPairs: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: '"', close: '"', notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: '"', close: '"' },
  ],
  wordPattern: /[^\s()[\]{}",'`;]+/,
};

export const monarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".rkt",
  brackets: [
    { open: "(", close: ")", token: "delimiter.parenthesis" },
    { open: "[", close: "]", token: "delimiter.square" },
    { open: "{", close: "}", token: "delimiter.curly" },
  ],
  tokenizer: {
    root: [
      { include: "@whitespace" },
      [/^#lang[ \t].*$/, "metatag"],
      [/^#reader.*$/, "metatag"],
      [/#;/, "comment.datum"],
      [/"/, "string", "@string"],
      [/#\\(?:x[0-9a-fA-F]+|u[0-9a-fA-F]+|[a-zA-Z]+|.)/, "string.char"],
      [new RegExp(`#(?:t|f|true|false|T|F)(?=${DELIM}|$)`), "constant.language"],
      [new RegExp(`#:${IDENT}`), "keyword.hash"],
      [/#rx"|#px"/, "regexp", "@regexp"],
      [
        new RegExp(
          `(?:#[eixobd])*[+-]?(?:\\d+/\\d+|\\d*\\.\\d+(?:[eE][+-]?\\d+)?|\\d+\\.?\\d*(?:[eE][+-]?\\d+)?|[0-9a-fA-F]+)(?=${DELIM}|$)`,
        ),
        "number",
      ],
      [/['`]|,@|,|#'|#`|#,@|#,/, "operator.quote"],
      [/[([{]/, "@brackets", "@afterOpen"],
      [/[)\]}]/, "@brackets"],
      [new RegExp(IDENT), "identifier"],
    ],
    // Immediately after an opening delimiter: classify the head symbol.
    afterOpen: [
      { include: "@whitespace" },
      [new RegExp(`(?:${DEFINING_FORMS.map(escape).join("|")})(?=${DELIM}|$)`), { token: "keyword", next: "@defName" }],
      [new RegExp(`(?:${STRUCT_FORMS.map(escape).join("|")})(?=${DELIM}|$)`), { token: "keyword", next: "@structName" }],
      [wordRegex(TEST_FORMS), { token: "keyword.test", next: "@pop" }],
      [wordRegex(SPECIAL_FORMS), { token: "keyword", next: "@pop" }],
      [/./, { token: "@rematch", next: "@pop" }],
    ],
    defName: [
      { include: "@whitespace" },
      [/[([]/, { token: "@brackets", switchTo: "@defFunctionName" }],
      [new RegExp(IDENT), { token: "entity.name.function", next: "@pop" }],
      [/./, { token: "@rematch", next: "@pop" }],
    ],
    defFunctionName: [
      { include: "@whitespace" },
      [new RegExp(IDENT), { token: "entity.name.function", next: "@pop" }],
      [/./, { token: "@rematch", next: "@pop" }],
    ],
    structName: [
      { include: "@whitespace" },
      [new RegExp(IDENT), { token: "type", next: "@pop" }],
      [/./, { token: "@rematch", next: "@pop" }],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/#\|/, "comment", "@blockComment"],
      [/;.*$/, "comment"],
    ],
    blockComment: [
      [/#\|/, "comment", "@push"],
      [/\|#/, "comment", "@pop"],
      [/[^|#]+/, "comment"],
      [/[|#]/, "comment"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
    regexp: [
      [/[^\\"]+/, "regexp"],
      [/\\./, "regexp.escape"],
      [/"/, "regexp", "@pop"],
    ],
  },
};

export function registerRacketLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === RACKET_LANGUAGE_ID)) return;
  monaco.languages.register({
    id: RACKET_LANGUAGE_ID,
    extensions: [".rkt", ".rktl", ".rktd", ".scm", ".ss"],
    aliases: ["Racket", "racket"],
  });
  monaco.languages.setLanguageConfiguration(RACKET_LANGUAGE_ID, languageConfiguration);
  monaco.languages.setMonarchTokensProvider(RACKET_LANGUAGE_ID, monarch);
}
