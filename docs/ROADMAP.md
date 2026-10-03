# Roadmap

Development proceeds in phases. The application remains usable after each
phase.

## Phase 1: Editor and runtime (complete)

- Desktop application with the Monaco editor, tabs and themes
- Opening and saving files with byte-exact preservation; refusal of WXME and
  non-UTF-8 files
- Racket runtime discovery and selection on Windows, macOS and Linux
- Run, Stop, program output and Interactions with history and search
- Preservation and display of teaching-language metadata
- New files with DrRacket's exact metadata

## Phase 2: Student workflow (in progress)

Complete:

- Tests panel based on the official test engine, with links to failed checks
- Official HtDP Stepper for metadata files and `#lang htdp` files, with full
  step history and source highlighting
- Structured diagnostics with categories, source excerpts and the original
  message
- Profile and mode selection in the status bar
- Folder explorer
- Choose Language for existing files
- First-run Setup that installs the official Racket when it is missing
- Signed in-app updates and release builds for Windows and macOS

Remaining:

- Racket-aware indentation, ported from `syntax-color/racket-indentation` and
  verified line by line against the official module
- Bracket tools: jump to the matching delimiter, select the enclosing
  expression, expand and shrink the selection, unmatched delimiter
  diagnostics while typing
- Source locations for runtime errors
- Display of exact fractions and images as DrRacket shows them

## Phase 3: Assignment workspace

Design: [Assignment overlays](ASSIGNMENT_OVERLAYS.md).

- Import of assignment text, starting with pasted text, plain text and
  Markdown
- Problem parsing and an assignment panel
- Manual linking of problems to code, shown as editor decorations
- Region data stored outside source files
- Focus on the current problem and navigation between problems
- Tests that prove source files are never modified and that anchors stay
  correct as code is edited

## Phase 4: Editor intelligence

- Completion limited to the lexical scope and the active language
- Go to definition, find references, symbols, outline and safe rename
- Structural selection, workspace search, quick open and a command palette
- Evaluation of `drracket/check-syntax` and `racket-langserver`, used behind
  adapters

## Phase 5: Course integration

- Assignment profiles with explicitly listed course rule warnings
- Submission Preflight: plain text, expected language, UTF-8, successful local
  initialization and file name, with no claims about grades
- Course-specific Stepper providers, only where a course's rules are
  documented and verified

## Later

Git integration, a plugin architecture that cannot change program
semantics, additional profiles, and code signing and notarization of the
installers.
