# Third-party notices

PhDRacket's own code is licensed under the MIT License. See `LICENSE`.

## Racket and htdp-lib

Racket and its packages are dual-licensed under the Apache License 2.0 and
the MIT License (<https://racket-lang.org/license.html>).

No Racket source code is copied into PhDRacket. The files below transcribe
facts from Racket 9.3, or follow the order of calls in Racket's own code, and
name their sources:

| PhDRacket file | Source in Racket 9.3 | Content |
|---|---|---|
| `backend/racket/private/metadata.rkt` | `htdp-lib/lang/htdp-langs.rkt` (`add-htdp-language`, `metadata->settings`, `unmarshall-teachpack-settings`, `get-metadata-lines`) and `htdp-lib/lang/htdp-langs-save-file-prefix.rkt` | Language table and metadata parsing |
| `backend/racket/phdracket-bridge.rkt` | `htdp-lib/lang/htdp-langs.rkt` (`on-execute`, `front-end/interaction`), `drracket-core-lib/drracket/private/language.rkt` (`initialize-simple-module-based-language`, default reader), `drracket-core-lib/drracket/private/module-language.rkt` (module run sequence), `htdp-lib/lang/private/sl-stepper-button.rkt` (Stepper settings for `#lang` files) | Order of calls into Racket's own libraries |
| `backend/racket/private/stepper-adapter.rkt` | `htdp-lib/stepper/stepper-tool.rkt`, `stepper/private/view-controller.rkt`, `stepper/private/mred-extensions.rkt` (`strip-to-sexp`, pretty-print hooks), `drracket/private/eval.rkt` (`expand-program`) | Driving the official Stepper model and rendering its steps as text |
| `backend/src/language.rs`, `frontend/workspace/new-file.ts` | `htdp-langs.rkt`, `htdp-langs-save-file-prefix.rkt` | Metadata prefix lines and reader names |

PhDRacket does not bundle Racket. It runs the Racket installation on the
user's computer.

## Libraries

| Library | License |
|---|---|
| Tauri and its plugins (dialog, updater, process) | Apache-2.0 or MIT |
| React, React DOM | MIT |
| Monaco Editor | MIT |
| serde, serde_json | Apache-2.0 or MIT |
| sha2 | Apache-2.0 or MIT |
| thiserror | Apache-2.0 or MIT |
| Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |

The full license texts are distributed with each package.
