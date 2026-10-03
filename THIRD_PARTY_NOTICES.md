# Third-party notices

PhDRacket's own code is MIT-licensed (see `LICENSE`).

## Code adapted from other projects

### Racket / htdp-lib (Apache-2.0 OR MIT)

No Racket source code is copied into PhDRacket. The following are
transcriptions of facts or small, clearly marked mirrors of logic, with
provenance:

| PhDRacket file | Derived from (Racket 9.3) | What |
|---|---|---|
| `backend/racket/private/metadata.rkt` | `htdp-lib/lang/htdp-langs.rkt` (`add-htdp-language` calls, `metadata->settings`, `unmarshall-teachpack-settings`, `get-metadata-lines`), `htdp-lib/lang/htdp-langs-save-file-prefix.rkt` | language table, metadata parsing |
| `backend/racket/phdracket-bridge.rkt` | `htdp-lib/lang/htdp-langs.rkt` (`on-execute`, `front-end/interaction`), `drracket-core-lib/drracket/private/language.rkt` (`initialize-simple-module-based-language`, default reader), `drracket-core-lib/drracket/private/module-language.rkt` (module run sequence) | the order of calls into Racket's own libraries |
| `backend/racket/private/stepper-adapter.rkt` | `htdp-lib/stepper/stepper-tool.rkt`, `stepper/private/view-controller.rkt`, `stepper/private/mred-extensions.rkt` (`strip-to-sexp`, pretty-print hooks), `drracket/private/eval.rkt` (`expand-program`) | driving the official stepper model and rendering its steps as text |
| `backend/src/language.rs`, `frontend/workspace/new-file.ts` | `htdp-langs.rkt` and `htdp-langs-save-file-prefix.rkt` | the metadata prefix lines and reader names |

Racket and its packages are dual-licensed under Apache-2.0 or MIT
(<https://racket-lang.org/license.html>).

## Libraries used at build or run time

| Library | License |
|---|---|
| Tauri, tauri-plugin-dialog | Apache-2.0 OR MIT |
| React, React DOM | MIT |
| Monaco Editor | MIT |
| serde, serde_json | Apache-2.0 OR MIT |
| sha2 | Apache-2.0 OR MIT |
| thiserror | Apache-2.0 OR MIT |
| Vite, Vitest, TypeScript | MIT, MIT, Apache-2.0 |

Their full license texts are distributed with the respective packages.

## Racket itself

PhDRacket does not bundle Racket. It runs the user's own installation.
