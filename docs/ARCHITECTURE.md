# Architecture

```
┌─────────────────────────────────────────────┐
│ UI  (React + Monaco)          frontend/      │
│ editing mechanics, presentation only         │
└───────────────────┬─────────────────────────┘
                    │ typed IPC (Tauri commands + events)
                    │ shared/protocol/index.ts ⇄ backend/src/protocol.rs
┌───────────────────▼─────────────────────────┐
│ Backend  (Rust)               backend/src/   │
│ runtime discovery · bridge processes ·       │
│ byte-exact source IO · settings              │
│ Tauri shell: apps/desktop/src-tauri/         │
└───────────────────┬─────────────────────────┘
                    │ JSON lines over stdin/stdout
┌───────────────────▼─────────────────────────┐
│ Racket bridge                 backend/racket/│
│ runs inside the user's official Racket;      │
│ calls htdp-lib / DrRacket entry points       │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│ Official Racket + HtDP teaching languages    │
│ semantics · error messages · test engine     │
└─────────────────────────────────────────────┘
```

**The frontend never decides program semantics.** It sends text to the
backend and renders what the bridge reports. The only code that evaluates
student programs is `backend/racket/phdracket-bridge.rkt`, which delegates to
official Racket libraries.

## Repository layout

| Path | Contents |
|---|---|
| `apps/desktop/` | Vite entry (`index.html`, `src/main.tsx`), Tauri shell (`src-tauri/`), end-to-end test (`e2e/`) |
| `frontend/` | UI modules: `app/` (store, layout, dialogs), `editor/`, `interactions/`, `tests/`, `stepper/`, `problems/`, `status-bar/`, `settings/`, `workspace/`, `run/`, `ipc/` |
| `shared/protocol/` | TypeScript types for the IPC protocol |
| `shared/models/` | Course profiles and modes |
| `backend/` | Rust crate `phdracket-core` (no UI, no Tauri) |
| `backend/racket/` | The Racket bridge and the Stepper adapter |
| `compatibility-tests/` | Golden corpus, golden transcripts, bridge tests, fixtures |
| `docs/` | This documentation |

## The Racket bridge

`phdracket-bridge.rkt` is embedded in the binary, written to the per-user
cache directory, and compiled once with the selected installation's own
`raco make` (only the bridge's two files are compiled; all dependencies come
from the installation). See [RACKET_INTEGRATION.md](RACKET_INTEGRATION.md).

Each bridge process hosts **exactly one Run**. Pressing Run kills the previous
process and uses a fresh one, so no Interactions state can leak between runs.
To keep Run fast, the backend keeps one *spare* process that has loaded the
teaching-language libraries but has run nothing.

### Two run paths, both mirroring DrRacket

**Teaching-language files** (DrRacket's three-line metadata header):
mirrors `htdp-lib/lang/htdp-langs.rkt`:

1. parse the metadata (`backend/racket/private/metadata.rkt`, mirroring
   `metadata->settings`; unknown readers are refused, not guessed);
2. `on-execute`: reader parameters, `test-engine/racket-tests`,
   `deinprogramm/signature/signature-english`, the language module,
   `initialize-test-object!`, `configure/settings` from `htdp/bsl/runtime`;
3. `front-end/complete-program`: `expand-teaching-program` from
   `lang/run-teaching-program` with DrRacket's default reader;
4. `front-end/interaction`: `#%top-interaction`, re-running `(test)` when an
   interaction changes the test object;
5. error messages through `get-rewriten-error-message`, as DrRacket's
   `teaching-languages-error-display-handler` does.

**`#lang` files**: mirrors `drracket/private/module-language.rkt`: declare
the module under the file's path, run language-info and `configure-runtime`
configuration, instantiate, run the `test` and `main` submodules, then
evaluate Interactions in `module->namespace`.

Files with neither are rejected with DrRacket's module-language message.

### Bridge protocol

One JSON object per line.

Commands (backend → bridge):

```
{"op":"run","id":N,"path":P|null,"source":S}
{"op":"eval","id":N,"text":S}
{"op":"step","id":N,"path":P|null,"source":S}
{"op":"shutdown"}
```

Events (bridge → backend):

| `ev` | Fields | Meaning |
|---|---|---|
| `ready` | `protocol`, `racketVersion`, `vm`, `htdp` | process started |
| `run-started` | `id`, `language` | the language actually used |
| `value` | `id`, `text` | a printed result, rendered by the language's printer |
| `stdout` / `stderr` | `text` | program output (chunk boundaries carry no meaning) |
| `error` | `id`, `kind`, `message`, `originalMessage`, `srclocs` | `message` is what DrRacket shows; `originalMessage` is `exn-message` |
| `tests` | `id`, `total`, `failed`, `signatureViolations`, `failures`, `report` | from htdp's test engine; `report` is its own text |
| `step` | `id`, `index`, `step` | one rendered step from the official stepper ([STEPPER.md](STEPPER.md)) |
| `stepper-finished` | `id`, `outcome`, `count` | `finished`, `error` or `limit` |
| `done` | `id`, `ok` | the request finished |
| `protocol-error` | `message` | a malformed command |

Program output is captured through custom ports, so a program cannot write
to the protocol stream. Source locations are Racket's: 1-based lines and
positions, 0-based columns, counted in characters (code points).

## Backend (Rust)

`backend/src/`:

- `source.rs`: byte-exact file IO. The editor sees LF-normalized text; the
  original bytes, line-ending style and BOM are remembered; saving unchanged
  text writes the original bytes; WXME, non-UTF-8 and binary files are
  refused. Writes go through a temporary file and a rename.
- `language.rs`: display-only language detection (status bar, decorations),
  cross-checked against the bridge by tests.
- `runtime.rs`: discovery and probing of Racket installations.
- `bridge.rs`: installing and compiling the bridge.
- `engine.rs`: the Run/Interactions model and process management.
- `protocol.rs`: typed messages.
- `settings.rs`: app settings in the per-user config directory.

The Tauri shell (`apps/desktop/src-tauri/src/commands.rs`) only adapts these
to IPC commands. When the program is run, the backend sends exactly the text
that saving would write (same line endings), minus a BOM, which Racket's load
handler also ignores.

## Frontend

- `app/store.ts`: application state and actions. The only module (with
  `ipc/backend.ts`) that talks to the backend.
- `run/session.ts`: pure reducer from bridge events to Run/Interactions state
  (unit-tested). Labels errors by the exception kind only.
- `editor/`: Monaco setup (local, no CDN, no bundled language services),
  Racket tokenizer, srcloc → editor-range conversion (code points vs UTF-16),
  a lexical scanner used only for editor mechanics.

The editor never auto-runs code, never rewrites the file on open, and
autosave and format-on-save default to off.
