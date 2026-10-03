# Testing

PhDRacket's tests focus on compatibility. Wherever program meaning is
involved, they run against the installed official Racket.

## Test suites

| Command | What it checks |
|---|---|
| `raco test compatibility-tests/bridge-tests.rkt` | Expected transcripts for every corpus program; agreement with the `racket` command; rejection of constructs outside the language; expected Stepper sequences; process isolation; new-file metadata against Racket's printer |
| `cargo test -p phdracket-core` | File access over the whole corpus (round trip, plain text, metadata preservation); language detection against the bridge; protocol; runtime; folder listing; embedding of the bridge; Run reset, Stop and Stepper against real Racket |
| `pnpm test` | Frontend units: Run and Stepper state, source location conversion, the lexical scanner, new-file metadata, profiles |
| `pnpm typecheck` | TypeScript types |
| `node apps/desktop/e2e/smoke.mjs` | The desktop application end to end (Windows) |

Rust tests that need Racket are skipped, with a message, when no Racket with
htdp-lib is installed. Set `PHDRACKET_REQUIRE_RACKET=1` to turn a skip into a
failure. The CI workflow sets it.

Before running `raco test`, compile the bridge in place for speed:

```bash
raco make backend/racket/phdracket-bridge.rkt
```

The compiled files are ignored by Git. Do not set `PLTCOMPILEDROOTS` for this,
because it makes `raco make` recompile the entire Racket installation.

## Coverage of the compatibility requirements

| Requirement | Tests |
|---|---|
| Untouched files keep their bytes | `backend/tests/corpus.rs` `test_a_untouched_save_is_byte_identical`; end-to-end test |
| Same results as official Racket | `bridge-tests.rkt` comparisons with `racket <file>`; expected transcripts |
| Language restrictions are kept | `bridge-tests.rkt` "Test C"; corpus `bsl/lambda-not-allowed.rkt`; end-to-end test |
| Test outcomes | Corpus `bsl/tests-mixed.rkt` with `check-expect`, `check-within`, `check-error`, `check-member-of` and `check-range` |
| Run resets Interactions | `backend/tests/engine.rs` `test_e_run_resets_interactions`; end-to-end test |
| Syntax and read errors | Corpus `unmatched-paren`, `malformed-define` and `unbound-identifier` |
| Plain text | `backend/tests/corpus.rs` `test_g_new_files_are_plain_text`; unit tests in `source.rs` |
| Metadata preservation | `backend/tests/corpus.rs` `test_h_metadata_lines_survive_body_edits` |
| Stepper | Expected sequences for `compatibility-tests/stepper-corpus/`; `engine.rs`; end-to-end test |
| Mode switching | End-to-end test |
| Folders are only read | `workspace.rs` unit test; end-to-end test |
| Assignment overlays | Planned with Phase 3. See [Assignment overlays](ASSIGNMENT_OVERLAYS.md). |

## Golden corpus

`compatibility-tests/corpus/` and `compatibility-tests/stepper-corpus/`
contain small programs written to test the IDE. They cover numbers,
Booleans, conditionals, structures, lists, recursion, `local`, higher-order
functions, mutation, test forms, errors, metadata variants, teachpacks,
Unicode text, CRLF line endings, and `#lang` files. The corpus must never
contain course assignment solutions.

`.gitattributes` keeps these files byte for byte, so their line endings are
never converted.

`compatibility-tests/expected/` records what the bridge reports for each
program. Stepper sequences mark highlighted expressions with ⟦ and ⟧. To
regenerate the files after an intentional change:

```bash
PHDRACKET_UPDATE_GOLDEN=1 raco test compatibility-tests/bridge-tests.rkt
```

Review every changed file before committing it, and compare surprising output
with DrRacket 9.3. An expected file is only as reliable as its review. Writing
the corpus has already caught incorrect assumptions: for example,
`(define f (lambda (x) x))` is legal Beginning Student, so a test program
meant to use `lambda` illegally had to be rewritten.

## End-to-end test

The end-to-end test starts the debug build of the application with the
WebView2 DevTools endpoint enabled and drives it through the application
state exposed in development builds. It checks, against real Racket: opening a
folder and a file, Run, Interactions, the notice that Definitions changed,
Run reset, saving without changes, the Stepper and mode switching. It uses
its own temporary settings file, so it never changes the user's settings.
Screenshots are saved to `apps/desktop/e2e/out/`.

```bash
pnpm dev
```

In a second terminal:

```bash
cargo build -p phdracket-desktop
```

```bash
node apps/desktop/e2e/smoke.mjs
```

## Continuous integration

`.github/workflows/ci.yml` runs the frontend, Racket and Rust suites on Linux
with Racket 9.3 for every push to `main` and every pull request.
