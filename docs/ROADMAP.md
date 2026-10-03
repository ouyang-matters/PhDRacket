# Roadmap

Each phase leaves the app usable.

## Phase 1: Editor + runtime ✅

- Tauri desktop shell, Monaco editor, tabs, themes
- open / save with byte-exact preservation; WXME/non-UTF-8 files refused
- Racket runtime discovery and selection (Windows, macOS, Linux)
- Run, Stop, Output, Interactions (history, multi-line, search)
- teaching-language metadata preserved and shown
- new files with DrRacket's exact metadata

## Phase 2: Student workflow (in progress)

- ✅ Tests panel (official test engine), clickable failures
- ✅ Stepper (official HtDP stepper), full history, source highlighting
- ✅ structured diagnostics with categories, source excerpts, original message
- ✅ status-bar mode/profile selector (CS145, CS135, HtDP, Racket)
- ☐ syntax-aware indentation: port of `syntax-color/racket-indentation`,
  verified line by line against the official module over the corpus
- ☐ bracket tools: jump to matching delimiter, select enclosing expression,
  expand/shrink selection, unmatched-delimiter diagnostics while typing
- ☐ runtime-error source highlighting (DrRacket's continuation-mark annotation)
- ☐ number/image rendering matching DrRacket's snips

## Phase 3: Assignment workspace

Design: [ASSIGNMENT_OVERLAYS.md](ASSIGNMENT_OVERLAYS.md).

- assignment import (paste/plain text/Markdown first)
- problem parser, assignment panel
- manual linking, region overlays (decorations only), external metadata
- focus current problem, navigation
- tests proving zero source modification and robust anchoring

## Phase 4: IDE intelligence

- completion from lexical scope and the active language's exports only
- go to definition, find references, symbols, outline, safe rename,
  structural selection, workspace search, quick open, command palette
- investigate `drracket/check-syntax` (non-GUI) and `racket-langserver`,
  behind adapters

## Phase 5: Course integration

- assignment profiles with explicitly listed course-rule warnings
- Submission Preflight (plain text, expected language, UTF-8, initializes
  locally, filename) with no grading claims
- course Stepper providers only where rules are documented and verified

## Later

Git integration, plugin architecture (no semantic changes), more profiles,
debugger-style visualization.
