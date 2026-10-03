# Architecture

PhDRacket has four layers. Each layer talks only to its neighbors.

```
┌──────────────────────────────────────────────┐
│ User interface (React, Monaco)    frontend/   │
│ Editing and presentation only                 │
└───────────────────┬──────────────────────────┘
                    │ Typed IPC: Tauri commands and events
                    │ shared/protocol/index.ts and backend/src/protocol.rs
┌───────────────────▼──────────────────────────┐
│ Backend (Rust)                 backend/src/   │
│ Runtime discovery, bridge processes,          │
│ byte-exact file access, settings              │
│ Tauri shell: apps/desktop/src-tauri/          │
└───────────────────┬──────────────────────────┘
                    │ JSON lines over standard input and output
┌───────────────────▼──────────────────────────┐
│ Racket bridge                backend/racket/  │
│ Runs inside the user's Racket installation    │
│ and calls htdp-lib and DrRacket entry points  │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│ Official Racket and HtDP teaching languages   │
│ Semantics, error messages, test engine,       │
│ Stepper                                       │
└──────────────────────────────────────────────┘
```

The user interface never decides what a program means. It sends text to the
backend and displays what the bridge reports. The only code that evaluates
student programs is the Racket bridge, and the bridge delegates every
semantic decision to official Racket libraries.

## Repository layout

| Path | Contents |
|---|---|
| `apps/desktop/` | Vite entry point, Tauri shell (`src-tauri/`), end-to-end test (`e2e/`) |
| `frontend/` | User interface modules (see below) |
| `shared/protocol/` | TypeScript types for the IPC protocol |
| `shared/models/` | Course profiles and modes |
| `backend/` | Rust crate `phdracket-core`, independent of the user interface |
| `backend/racket/` | The Racket bridge and the Stepper adapter |
| `compatibility-tests/` | Golden corpus, expected transcripts, bridge tests, fixtures |
| `.github/workflows/` | Continuous integration and release builds |
| `docs/` | This documentation |

## Racket bridge

The bridge is embedded in the application. At startup it is written to the
per-user data directory and compiled once with the selected installation's
own `raco make`. Only the bridge's own files are compiled; all libraries come
from the installation. See [Racket integration](RACKET_INTEGRATION.md).

Each bridge process hosts exactly one Run or one Stepper session. Pressing Run
ends the previous process and uses a new one, so no Interactions state can
carry over from one Run to the next. To keep Run fast, the backend keeps one
spare process that has loaded the teaching-language libraries but has not run
anything.

### Running a program

There are two run paths. Both follow DrRacket's own code.

**Files with DrRacket metadata** (the three-line header DrRacket writes for
teaching languages) follow `htdp-lib/lang/htdp-langs.rkt`:

1. Read the metadata (`backend/racket/private/metadata.rkt`, which mirrors
   `metadata->settings`). Unknown languages are refused rather than guessed.
2. Configure the runtime as `on-execute` does: reader parameters,
   `test-engine/racket-tests`, the signature library, the language module,
   `initialize-test-object!`, and `configure/settings` from
   `htdp/bsl/runtime`.
3. Expand and evaluate the program with `expand-teaching-program` from
   `lang/run-teaching-program`, using DrRacket's default reader.
4. Evaluate Interactions with `#%top-interaction`, and run the tests again
   when an interaction adds a test, as `front-end/interaction` does.
5. Report errors with `get-rewriten-error-message`, the function DrRacket's
   teaching-language error display uses.

**Files with a `#lang` line** follow
`drracket/private/module-language.rkt`: declare the module under the file's
path, apply the language's runtime configuration, instantiate the module, run
its `test` and `main` submodules, and evaluate Interactions in the module's
namespace.

A file with neither is refused with DrRacket's module-language message.

### Bridge protocol

Each message is one JSON object on one line.

Commands from the backend to the bridge:

```
{"op":"run","id":N,"path":P|null,"source":S}
{"op":"eval","id":N,"text":S}
{"op":"step","id":N,"path":P|null,"source":S}
{"op":"shutdown"}
```

Events from the bridge to the backend:

| `ev` | Fields | Meaning |
|---|---|---|
| `ready` | `protocol`, `racketVersion`, `vm`, `htdp` | The process has started. |
| `run-started` | `id`, `language` | The language actually used. |
| `value` | `id`, `text` | A printed result, rendered by the language's printer. |
| `stdout`, `stderr` | `text` | Program output. Chunk boundaries carry no meaning. |
| `error` | `id`, `kind`, `message`, `originalMessage`, `srclocs` | `message` is the text DrRacket shows; `originalMessage` is the exception's own message. |
| `tests` | `id`, `total`, `failed`, `signatureViolations`, `failures`, `report` | Results from the HtDP test engine, including its own report text. |
| `step` | `id`, `index`, `step` | One rendered step from the official Stepper. See [Stepper](STEPPER.md). |
| `stepper-finished` | `id`, `outcome`, `count` | The outcome is `finished`, `error` or `limit`. |
| `done` | `id`, `ok` | The request is complete. |
| `protocol-error` | `message` | The bridge received a malformed command. |

Program output is captured through custom ports, so a program cannot write to
the protocol stream. Source locations use Racket's conventions: lines and
positions start at 1, columns start at 0, and all are counted in characters
(Unicode code points).

## Backend

The Rust crate in `backend/src/`:

| Module | Responsibility |
|---|---|
| `source.rs` | Byte-exact file access. The editor receives text with LF line endings. The original bytes, line-ending style and byte-order mark are remembered and restored on save. Saving unchanged text writes the original bytes. DrRacket WXME files, non-UTF-8 files and binary files are refused. Every write goes through a temporary file and a rename. |
| `language.rs` | Language detection for display (status bar, editor decorations). Tests check it against the bridge. |
| `runtime.rs` | Discovery and probing of Racket installations. |
| `bridge.rs` | Installing and compiling the bridge. |
| `engine.rs` | The Run, Interactions and Stepper processes. |
| `workspace.rs` | Read-only folder listing for the Explorer. |
| `protocol.rs` | Typed messages. |
| `settings.rs` | Application settings in the per-user configuration directory. |

The Tauri shell (`apps/desktop/src-tauri/src/commands.rs`) adapts these
modules to IPC commands and adds no logic of its own. When a program is run,
the backend sends exactly the text that saving would write, with the same line
endings. A UTF-8 byte-order mark is removed, as Racket's load handler also
ignores it.

The shell also includes the Tauri updater. It downloads a signed update
manifest from the repository's `updater` branch, verifies the update's
signature and installs it only after the user confirms.

## User interface

| Module | Responsibility |
|---|---|
| `app/` | Application state and actions (`store.ts`), layout, dialogs, update checks |
| `ipc/` | The only module that calls the backend |
| `editor/` | Monaco setup (bundled locally, without Monaco's language services), Racket tokenizer, conversion of Racket source locations to editor ranges |
| `explorer/` | Folder tree |
| `interactions/` | Interactions panel |
| `run/` | Pure reducer from bridge events to Run and Interactions state |
| `stepper/` | Stepper state and panel |
| `tests/`, `problems/` | Test results, diagnostics and program output |
| `status-bar/` | Profile selector, language, runtime and cursor position |
| `settings/` | Preferences |
| `workspace/` | New-file templates, language detection for display, and the Choose Language edit |

The editor never runs code automatically and never changes a file when it is
opened. Autosave and format on save are off by default.
