# Testing

PhDRacket's tests are about compatibility first. They run against the
installed official Racket wherever semantics are involved.

## Suites

| Command | What it checks |
|---|---|
| `raco test compatibility-tests/bridge-tests.rkt` | Golden transcripts for every corpus program; agreement with official `racket <file>`; Test C; golden Stepper sequences; one Run per process; protocol isolation; new-file headers vs Racket's printer |
| `cargo test -p phdracket-core` | Source IO (Tests A, G, H over the corpus), language detection vs the bridge, protocol, runtime, bridge embedding, Test E, Stop and Stepper/Interactions independence against real Racket |
| `pnpm test` | Frontend units: run-session and stepper reducers, srcloc conversion, lexical scanner, new-file headers vs fixture, profiles |
| `node apps/desktop/e2e/smoke.mjs` | The real desktop app end to end (Windows; needs `pnpm dev` running and a debug build) |

Racket-dependent Rust tests are skipped with a message when no Racket with
htdp-lib is installed; set `PHDRACKET_REQUIRE_RACKET=1` to make that a failure
(CI should set it).

## The compatibility tests (spec letters)

| Test | Where |
|---|---|
| A: untouched file preservation | `backend/tests/corpus.rs` `test_a_untouched_save_is_byte_identical`; e2e "saving the unedited document…" |
| B: runtime equivalence | `bridge-tests.rkt` oracle tests (success/failure + message vs `racket <file>`) and golden transcripts |
| C: prohibited construct | `bridge-tests.rkt` "Test C"; corpus `bsl/lambda-not-allowed.rkt`; e2e |
| D: tests | corpus `bsl/tests-mixed.rkt` (check-expect/within/error/member-of/range), golden transcripts |
| E: Run reset | `backend/tests/engine.rs` `test_e_run_resets_interactions`; e2e |
| F: syntax errors | corpus `unmatched-paren`, `malformed-define`, `unbound-identifier`, golden transcripts |
| G: text purity | `backend/tests/corpus.rs` `test_g_new_files_are_plain_text`; `source.rs` unit tests |
| H: language metadata | `backend/tests/corpus.rs` `test_h_metadata_lines_survive_body_edits` |
| Stepper | `bridge-tests.rkt` "stepper golden sequence" over `stepper-corpus/`; `engine.rs`; e2e |
| Mode switching | e2e "switching CS145 / HtDP / Racket modes leaves the file … unchanged" |
| Assignment overlays | planned with Phase 3 (see [ASSIGNMENT_OVERLAYS.md](ASSIGNMENT_OVERLAYS.md)) |

## Golden corpus

`compatibility-tests/corpus/` holds small **non-assignment** programs written
for testing the IDE: numbers, Booleans, conditionals, structures, lists,
recursion, `local`, higher-order functions, mutation, test forms, errors,
metadata variants, teachpacks, Unicode and CRLF files. It must never contain
course assignment solutions.

`compatibility-tests/expected/*.transcript` records what the bridge reports
for each program (and for a few Interactions per program). To regenerate
after an intentional change:

```bash
PHDRACKET_UPDATE_GOLDEN=1 raco test compatibility-tests/bridge-tests.rkt
```

Review every changed transcript. A transcript is only as good as its review:
compare surprising output with DrRacket 9.3 before accepting it.

Writing the corpus has already caught incorrect assumptions. For example,
`(define f (lambda (x) x))` *is* legal Beginning Student. The oracle test
agreed with the bridge and the transcript showed the program running, so the
test program was wrong, not the IDE.

## Before compiling the bridge in place

`raco test` loads the bridge from `backend/racket/`. Run
`raco make backend/racket/phdracket-bridge.rkt` first for speed (the compiled
files are git-ignored). Do not set `PLTCOMPILEDROOTS` for this: it makes
`raco make` recompile the entire Racket installation.

## End-to-end test

```bash
pnpm dev                                   # terminal 1
cargo build -p phdracket-desktop           # once
node apps/desktop/e2e/smoke.mjs            # terminal 2
```

The script starts the debug app with WebView2's DevTools endpoint enabled,
drives it through the store exposed in development builds, checks open → Run
→ Interactions → stale Definitions → Run reset → save → Stepper → mode
switching against real Racket, and saves screenshots to
`apps/desktop/e2e/out/`.
