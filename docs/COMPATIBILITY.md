# Compatibility

This document states precisely what PhDRacket guarantees, what it does not,
and where it is known to differ from DrRacket. It is written against
**Racket 9.3** (the version used by the initial target course).

## Guaranteed by PhDRacket

Each item is covered by an automated test (see [TESTING.md](TESTING.md)).

1. **Programs run in the official Racket installation** the user selected,
   through the same htdp-lib / DrRacket entry points DrRacket uses (see
   [ARCHITECTURE.md](ARCHITECTURE.md)). PhDRacket contains no interpreter.
2. **The language comes from the file.** Teaching-language files run in the
   language named by their DrRacket metadata; `#lang` files run as modules.
   A file is never run in a more permissive language. Files with metadata
   PhDRacket does not recognize are not run. (Corpus tests; Test C.)
3. **Unedited files are byte-identical after saving.** (Test A, over the whole
   corpus: SHA-256 before == after.)
4. **DrRacket metadata lines are preserved byte-for-byte** when the rest of the
   file is edited. Editing the metadata itself requires confirmation on save.
   (Test H.)
5. **Source files stay plain UTF-8 text.** PhDRacket never adds headers,
   markers or metadata. Files it cannot keep as plain text (DrRacket WXME
   files with images or boxes, other encodings, binary data) are refused, not
   converted. Line-ending style and a UTF-8 BOM are preserved. (Test G,
   `source.rs` unit tests.)
6. **Run discards the previous Interactions.** Each Run uses a new Racket
   process. (Test E.)
7. **Errors and test outcomes are Racket's.** The message shown is the one
   DrRacket shows (htdp's rewritten message for teaching languages); the
   original `exn-message` is always available. Pass/fail counts and the test
   report come from htdp's test engine. (Golden transcripts; oracle tests.)
8. **Success/failure agrees with official `racket`.** For every corpus file,
   the bridge fails if and only if `racket <file>` fails, with the same
   underlying message. (Oracle tests.)
9. **The Stepper is the official HtDP stepper.** Steps come from htdp-lib's
   stepper model; golden step sequences are tested.
10. **Switching profiles/modes never modifies the open file.** (E2E test.)
11. **New teaching-language files** created through *New file* start with
   exactly the metadata DrRacket 9.3 writes for that language with default
   settings (checked against Racket's own printer).

## Not guaranteed by PhDRacket

- **Grades.** PhDRacket cannot see private grading tests and never claims a
  file will pass them.
- **Course rules.** Restrictions an assignment imposes beyond the language
  (for example "only use material up to lecture 8") are not checked unless a
  course/assignment profile listing them is active (not yet implemented).
  Racket accepting a program does not mean an assignment permits it.
- **Identical display of every value.** PhDRacket shows the official
  *textual* rendering; DrRacket's graphical REPL renders some values as
  snips (see below).
- **Behavior under a different Racket version** than the course uses.
  PhDRacket always shows the version actually running.
- **Stepping conventions.** The Stepper is the official HtDP stepper and is
  labeled *HtDP Stepper*. Courses may teach written stepping conventions that
  differ; no course-specific stepping provider exists yet (see
  [STEPPER.md](STEPPER.md)).

## Known differences from DrRacket

| Area | DrRacket | PhDRacket | Status |
|---|---|---|---|
| Exact non-integer rationals (e.g. `(/ 1 3)`) | graphical number snip, repeating decimal (0.3 with overline) | `1/3`, htdp's official textual rendering (`number-markup->string`) | Value identical; display differs. Planned: render htdp's number markup. |
| Images (`2htdp/image`) | displayed inline | printed as `#<image>` (htdp's textual rendering) | Planned. |
| Test report | graphical test window/pane | the test engine's textual report, plus a summary panel | Same content. |
| Line numbers | DrRacket hides the three metadata lines, so line 1 is the first visible line | metadata lines are shown, so line numbers are **file** line numbers (DrRacket's + 3) | By design: the file is shown as it is. |
| Files without `#lang` or metadata | runs in whatever language is selected in DrRacket's language dialog | refused with DrRacket's module-language message | Conservative: the file itself does not say its language. |
| Stop | breaks the running thread; Interactions remain usable | terminates the process; press Run again | Simpler and safer. |
| `read` from standard input in a program | interactive input box | empty input | Planned if needed by courses. |
| Error-location highlighting for runtime errors | uses DrRacket's annotation of the program (continuation marks) | location shown only when the exception carries one (syntax/read errors, test failures) | Planned (MVP 1). |
| Tracing, debugging, profiling, test coverage | available | not available | Not planned for MVP. |
| Stepper | separate window, graphical rendering | Stepper panel, textual rendering of the same steps | See [STEPPER.md](STEPPER.md). |
| `big-bang` / `2htdp/universe` | GUI windows | the bridge runs under `racket`, not `gracket`; GUI teachpacks are untested | To verify. |

## Version-specific behavior

- The teaching-language table (readers, modules, per-language printing
  options) was transcribed from `htdp-lib/lang/htdp-langs.rkt` as shipped
  with **Racket 9.3**. A different Racket version may differ; PhDRacket
  warns when a course profile's expected version differs from the running one.
- The bridge relies on these htdp-lib / DrRacket interfaces, all present in
  Racket 9.3:
  - documented or stable: `lang/run-teaching-program` (`expand-teaching-program`),
    `htdp/bsl/runtime` (`configure/settings`, `sl-runtime-settings`),
    `test-engine/test-engine`, `test-engine/test-markup`, `test-engine/syntax`,
    `simple-tree-text-markup/text`, `deinprogramm/signature/signature`;
  - internal (isolated in the bridge, may change between versions):
    `lang/private/rewrite-error-message` (`get-rewriten-error-message`, the
    function DrRacket uses for teaching-language error text).
  A Racket upgrade must re-run the compatibility suite.

## Needs verification against DrRacket

These are believed correct from reading the 9.3 sources but have not yet been
compared with DrRacket's GUI side by side:

- Interactions after a `check-expect` typed in Interactions: DrRacket
  re-runs the test report; PhDRacket does the same through the same code path.
  The exact text shown has not been compared.
- Files beginning with a UTF-8 BOM: `racket` ignores the BOM (verified);
  DrRacket's behavior with such files is unverified.
- CRLF files: Racket counts CR LF as one position (relied on for source
  locations; verified for line numbers, not yet for positions in the GUI).
- Programs that print very wide values: DrRacket's print width depends on the
  window width; PhDRacket uses htdp's default width.
- Teachpacks that open windows (`2htdp/universe`).
