# PhDRacket

A modern Racket IDE for students who write course work in the HtDP teaching
languages.

PhDRacket runs your programs in the official Racket installation on your
computer, in the language your file declares, through the same HtDP entry
points DrRacket uses. It keeps your `.rkt` files exactly as DrRacket expects
them, so you can switch between the two at any time. What PhDRacket changes is
the editing experience: tabs, a folder explorer, a modern editor, a clear test
panel and an integrated Stepper.

PhDRacket is an independent open-source project. It is not affiliated with or
endorsed by the University of Waterloo or the Racket project.

## Download

Download the latest test release from the
**[Releases page](https://github.com/ouyang-matters/PhDRacket/releases)**.

1. Install PhDRacket:
   - **Windows:** run `PhDRacket_<version>_x64-setup.exe`. Administrator
     rights are not required. If Windows SmartScreen shows a warning, choose
     *More info*, then *Run anyway*. The installer is not code-signed yet.
   - **macOS (Apple Silicon and Intel):** open
     `PhDRacket_<version>_universal.dmg` and drag PhDRacket into Applications.
     The app is not notarized yet. The first time you open it, macOS blocks
     it; open *System Settings*, go to *Privacy & Security* and click
     *Open Anyway*.
2. Start PhDRacket. The Setup dialog asks for your course and theme, with
   defaults already selected.
   - If Racket is already installed, PhDRacket finds it, and you click
     *Finish*.
   - If not, click *Install Racket 9.3*. PhDRacket downloads the official
     Racket installer from racket-lang.org, checks it against the published
     checksum and installs it. On Windows, the official installer asks for
     administrator permission once. On macOS and Linux it installs into your
     user folder without administrator rights.

Installed copies check for new versions at startup and install them with one
click. The check can be turned off in Settings.

## Features

- **Official semantics.** Programs run in your installed Racket. PhDRacket
  contains no reimplementation of Racket.
- **Plain source files.** Saving an unedited file writes back exactly the same
  bytes. DrRacket's language metadata lines are preserved, and nothing is ever
  added to your source.
- **Definitions and Interactions.** Run evaluates the Definitions in a fresh
  environment. Interactions evaluate in that environment, with history and
  multi-line input. When the Definitions change after a Run, the Interactions
  panel says so.
- **Tests.** Results come from the official HtDP test engine. Failures link to
  the check that failed.
- **Stepper.** The official HtDP Stepper, with the complete step history,
  keyboard navigation and highlighting of the current expression in the
  editor.
- **Diagnostics.** Racket's own error messages with their source location. The
  original message is always available.
- **Editor.** Tabs, a folder explorer, find and replace, multiple cursors,
  bracket matching, light, dark and high-contrast themes, configurable fonts.
- **Choose Language.** Click the language in the status bar to switch between
  the teaching languages and `#lang racket`. Only the language declaration
  changes, in the same format DrRacket writes, and the change can be undone.
- **Profiles.** Waterloo CS145, Waterloo CS135, Generic HtDP and Racket. A
  profile sets defaults such as the expected Racket version. It never changes
  what a program means.

## What PhDRacket does not do

PhDRacket contains no code generation, AI completion or assignment solving,
and it does not connect to Marmoset or any other grading system. It cannot
know private grading tests and never claims that a file will pass them.

Your code stays on your computer. PhDRacket needs no account and collects no
telemetry. It only connects to the network to check for PhDRacket updates
(optional) and, when you ask it to, to download the official Racket
installer.

## Status

PhDRacket is in early development. The current focus is the student workflow
(Phase 2 of the [roadmap](docs/ROADMAP.md)). See
[Compatibility](docs/COMPATIBILITY.md) for exactly what is and is not
guaranteed, and for known differences from DrRacket.

## Building from source

Requirements: Racket 9.3, Rust (stable), Node.js 20 or later, pnpm, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
operating system.

```bash
pnpm install
pnpm tauri dev
```

Run the test suites:

```bash
cargo test -p phdracket-core
pnpm test
raco test compatibility-tests/bridge-tests.rkt
```

[Testing](docs/TESTING.md) describes all suites, including the end-to-end
test of the desktop app. [Contributing](docs/CONTRIBUTING.md) describes the
release process.

## Documentation

| Document | Contents |
|---|---|
| [Design principles](docs/DESIGN_PRINCIPLES.md) | The rules every feature follows |
| [Architecture](docs/ARCHITECTURE.md) | Components, data flow and the bridge protocol |
| [Racket integration](docs/RACKET_INTEGRATION.md) | Runtime discovery, processes and data locations |
| [Stepper](docs/STEPPER.md) | How the official Stepper is integrated |
| [Course profiles and modes](docs/COURSE_PROFILES.md) | What a profile does and does not affect |
| [Assignment overlays](docs/ASSIGNMENT_OVERLAYS.md) | Design of the planned assignment workspace |
| [Compatibility](docs/COMPATIBILITY.md) | Guarantees and known differences from DrRacket |
| [Testing](docs/TESTING.md) | Test suites and the golden corpus |
| [Contributing](docs/CONTRIBUTING.md) | Development setup, rules and releases |
| [Roadmap](docs/ROADMAP.md) | Development phases |

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
