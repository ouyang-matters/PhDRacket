# Compatibility

This document states what PhDRacket guarantees, what it does not guarantee,
and where it is known to differ from DrRacket. It describes behavior with
**Racket 9.3**, the version used by Waterloo CS145.

## Guarantees

Each guarantee is covered by automated tests. See [Testing](TESTING.md).

1. **Programs run in the official Racket installation** that the user
   selected, through the same htdp-lib and DrRacket entry points that
   DrRacket uses. PhDRacket contains no interpreter.
2. **The language comes from the file.** A file with DrRacket metadata runs in
   the teaching language that the metadata names. A file with a `#lang` line
   runs as a module. A file never runs in a more permissive language than it
   declares, and a file with unrecognized metadata does not run.
3. **Saving an unedited file writes the same bytes.** The SHA-256 hash of
   every corpus file is identical before and after opening and saving.
4. **DrRacket metadata lines are preserved byte for byte** when the rest of
   the file is edited. Saving after editing the metadata itself requires
   confirmation.
5. **Source files remain plain UTF-8 text.** PhDRacket never adds headers,
   markers or metadata to a file. Line-ending style and a UTF-8 byte-order
   mark are preserved. Files that cannot be kept as plain text, such as
   DrRacket WXME files containing images, files in other encodings and binary
   files, are refused rather than converted.
6. **Run discards the previous Interactions.** Every Run uses a new Racket
   process.
7. **Errors and test results come from Racket.** The error message shown is
   the one DrRacket shows, which for teaching languages is the HtDP rewritten
   message. The original exception message is always available. Test counts
   and the test report come from the HtDP test engine.
8. **Success and failure agree with the `racket` command.** For every corpus
   file, PhDRacket reports an error exactly when `racket <file>` fails, and
   with the same underlying message.
9. **The Stepper is the official HtDP Stepper.** Its steps come from the
   htdp-lib Stepper model. Expected step sequences are tested.
10. **Switching profiles never modifies the open file.**
11. **Opening a folder never modifies it.** The Explorer only reads folders.
12. **New teaching-language files** start with exactly the metadata that
    DrRacket 9.3 writes for that language with default settings. This is
    checked against Racket's own printer.

## Not guaranteed

- **Grades.** PhDRacket cannot see private grading tests and never claims
  that a file will pass them.
- **Course rules.** An assignment may restrict what students use beyond the
  language itself, for example to material covered up to a certain lecture.
  PhDRacket does not check such rules unless an assignment profile lists them.
  Assignment profiles are not implemented yet. A program that Racket accepts
  is not necessarily allowed by an assignment.
- **Identical display of every value.** PhDRacket shows the official textual
  rendering of values. DrRacket's graphical Interactions window displays some
  values differently. See the table below.
- **Behavior under a different Racket version.** PhDRacket always shows the
  version that is actually running.
- **Course stepping conventions.** The Stepper is the official HtDP Stepper
  and is labeled *HtDP Stepper*. A course may teach written stepping
  conventions that differ from it. See [Stepper](STEPPER.md).

## Known differences from DrRacket

| Area | DrRacket | PhDRacket | Status |
|---|---|---|---|
| Exact fractions such as `(/ 1 3)` | Graphical repeating decimal | `1/3`, the HtDP textual rendering | The value is identical; only the display differs. Planned. |
| Images from `2htdp/image` | Displayed inline | Printed as `#<image>`, the HtDP textual rendering | Planned. |
| Test report | Graphical test pane | The test engine's textual report and a summary panel | Same content. |
| Line numbers | The three metadata lines are hidden, so line 1 is the first visible line | The metadata lines are shown, so line numbers are file line numbers (DrRacket's plus 3) | By design. |
| Files without `#lang` or metadata | Run in the language selected in DrRacket's language dialog | Refused with DrRacket's module-language message | By design: the file does not state its language. |
| Stop | Interrupts the program; Interactions remain usable | Ends the process; press Run again | By design. |
| Reading from standard input | Interactive input box | Empty input | Planned if courses need it. |
| Location of runtime errors | Highlighted through DrRacket's program annotation | Shown only when the exception carries a location (syntax errors, read errors, test failures) | Planned. |
| Tracing, debugging, profiling, test coverage | Available | Not available | Not planned for now. |
| Stepper | Separate window with graphical rendering | Stepper panel with textual rendering of the same steps | See [Stepper](STEPPER.md). |
| `big-bang` and `2htdp/universe` | Graphical windows | Untested: the bridge runs under `racket`, not `gracket` | To be verified. |

## Version-specific behavior

The teaching-language table (readers, modules and printing options for each
language) was transcribed from `htdp-lib/lang/htdp-langs.rkt` in Racket 9.3.
Another Racket version may differ.

The bridge uses these interfaces, all present in Racket 9.3:

| Interface | Status |
|---|---|
| `lang/run-teaching-program` (`expand-teaching-program`) | Stable |
| `htdp/bsl/runtime` (`configure/settings`, `sl-runtime-settings`, `options->sl-runtime-settings`) | Stable |
| `test-engine/test-engine`, `test-engine/test-markup`, `test-engine/syntax` | Stable |
| `simple-tree-text-markup/text`, `deinprogramm/signature/signature` | Stable |
| `lang/private/rewrite-error-message` (`get-rewriten-error-message`) | Internal |
| `stepper/private/*` | Internal. See [Stepper](STEPPER.md). |

Internal interfaces are used only inside `backend/racket/` and can change
between Racket versions. After a Racket upgrade, run the compatibility suite
before relying on the new version.

## Not yet verified against DrRacket

These behaviors follow from the Racket 9.3 sources but have not yet been
compared with DrRacket side by side:

- The text shown after a `check-expect` is entered in Interactions.
- Files that begin with a UTF-8 byte-order mark. The `racket` command ignores
  the mark (verified); DrRacket's behavior is not verified.
- Source positions in files with CRLF line endings. Racket counts CR LF as one
  position; this is verified for line numbers only.
- Printing of very wide values. DrRacket's print width depends on the window
  width; PhDRacket uses the HtDP default width.
- Teachpacks that open windows, such as `2htdp/universe`.
