# Contributing

## Setup

- Racket 9.3 (standard distribution, includes htdp-lib)
- Rust stable, Node.js 20+, pnpm
- Tauri prerequisites for your OS: <https://tauri.app/start/prerequisites/>

```bash
pnpm install
raco make backend/racket/phdracket-bridge.rkt
pnpm tauri dev
```

If the repository lives on a cloud-synced or network drive, keep the Cargo
build directory elsewhere (`CARGO_TARGET_DIR`). The repository's `.npmrc`
uses a flat `node_modules` because such drives often do not support symlinks.

## Before submitting a change

```bash
raco test compatibility-tests/bridge-tests.rkt
cargo test -p phdracket-core
pnpm typecheck
pnpm test
```

UI changes should also pass the end-to-end test (see [TESTING.md](TESTING.md)).

## Rules

1. **Check upstream first.** If Racket, DrRacket or htdp-lib already does it,
   call it. Cite the upstream file you mirror in a comment.
2. **Racket decides semantics.** No evaluation logic in the frontend or Rust.
3. **Isolate internal APIs.** Internal htdp-lib/DrRacket interfaces are only
   used in `backend/racket/`, behind a small adapter, and listed in
   [COMPATIBILITY.md](COMPATIBILITY.md) or [STEPPER.md](STEPPER.md).
4. **Never modify source to make a feature easier.** Nothing is ever written
   into a `.rkt` file except the user's own edits.
5. **Test before claiming compatibility.** Add corpus programs and golden
   transcripts; review every transcript change against DrRacket.
6. **Keep UI text short.** Explanations belong in `docs/`.
7. **Licensing.** Before adapting code from Racket or any other project,
   check its license and record provenance in `THIRD_PARTY_NOTICES.md`.

## Corpus

`compatibility-tests/corpus/` and `stepper-corpus/` contain small programs
written for testing the IDE. Never add course assignment solutions.

## No generative features

Pull requests adding code generation, AI completion, solution suggestions,
or integration with grading systems will not be accepted.
