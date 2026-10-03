// External links, defined once. The Help menu, About and other places refer
// to these instead of spelling out URLs.

export const REPOSITORY = "https://github.com/ouyang-matters/PhDRacket";

export const LINKS = {
  documentation: `${REPOSITORY}#readme`,
  introduction: `${REPOSITORY}/blob/main/docs/introducing-phdracket.md`,
  releaseNotes: `${REPOSITORY}/releases`,
  reportIssue: `${REPOSITORY}/issues/new`,
  racketDocs: "https://docs.racket-lang.org/",
  htdpDocs: "https://htdp.org/",
  htdpLanguages: "https://docs.racket-lang.org/htdp-langs/index.html",
} as const;
