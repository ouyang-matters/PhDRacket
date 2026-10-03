# PhDRacket

A modern, course-conscious Racket IDE.

PhDRacket keeps Racket and HtDP as the semantic authority while providing a
modern editing environment for students who need DrRacket-compatible source
files.

PhDRacket aims to modernize editing, navigation, diagnostics and workflow
without bypassing the language restrictions or pedagogical constraints imposed
by introductory programming courses.

It is an independent open-source project and is not affiliated with the
University of Waterloo or the Racket project.

**Keep the course semantics. Improve the editor.**

## Download

Get the latest test release from
**[Releases](https://github.com/ouyang-matters/PhDRacket/releases)**.

1. Install [Racket](https://download.racket-lang.org/) first (standard
   distribution; CS145 uses 9.3).
2. **Windows:** run `PhDRacket_*_x64-setup.exe`. No administrator rights are
   needed. If SmartScreen appears, choose *More info* → *Run anyway*.
3. **macOS (Apple Silicon and Intel):** open `PhDRacket_*_universal.dmg` and
   drag PhDRacket to Applications. The first time you open it, go to
   *System Settings → Privacy & Security* and click *Open Anyway* (the app is
   not notarized yet).

Installed copies check for updates and install them with one click.

## What it is

- Your program runs in **your installed, official Racket**, in the language
  the file declares, through the same HtDP entry points DrRacket uses. There
  is no reimplementation of Racket in PhDRacket.
- Files stay **plain-text `.rkt` files**. Opening and saving an unedited file
  writes back the exact same bytes; DrRacket's language metadata lines are
  preserved; nothing is ever added to your source.
- **Run / Interactions** work like DrRacket: Run starts a fresh environment
  from the Definitions; Interactions evaluate in it; PhDRacket tells you when
  the Definitions have changed since the last Run.
- Errors and test results are **Racket's own**, shown with their source
  location and the original message always available.

## What it is not

PhDRacket contains no code generation, no AI completion, no assignment
solving, and no connection to Marmoset or any grading system. It cannot know
private grading tests and never claims a file will pass them. Your code stays
on your computer: no accounts, no uploads, no telemetry.

## Status

Early development (Phase 2 of [the roadmap](docs/ROADMAP.md)). Working today:

- desktop app (Tauri) with a Monaco editor, tabs, light/dark/high-contrast themes
- open / edit / save with byte-exact preservation
- Racket runtime discovery (Windows, macOS, Linux) and manual selection
- Run, Stop and Interactions (history, multi-line entries) using the official runtime
- test results from the official HtDP test engine
- diagnostics with source locations, highlighted in the editor
- the official HtDP Stepper with full step history
- profiles and modes: Waterloo CS145, Waterloo CS135, Generic HtDP, Racket
- new files with DrRacket's exact teaching-language metadata

See [docs/ROADMAP.md](docs/ROADMAP.md) for what comes next and
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for exactly what is and is not
guaranteed.

## Requirements

- [Racket](https://racket-lang.org) (the course currently uses 9.3) with the
  standard distribution's HtDP teaching languages.
- To build: Rust (stable), Node.js 20+, pnpm, and the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

## Building and running

```bash
pnpm install
pnpm tauri dev
```

Tests:

```bash
cargo test -p phdracket-core
pnpm test
raco test compatibility-tests/bridge-tests.rkt
```

See [docs/TESTING.md](docs/TESTING.md) for the full test suite, including the
end-to-end test of the desktop app.

## Documentation

- [Design principles](docs/DESIGN_PRINCIPLES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Racket integration](docs/RACKET_INTEGRATION.md)
- [Stepper](docs/STEPPER.md)
- [Course profiles and modes](docs/COURSE_PROFILES.md)
- [Assignment overlays](docs/ASSIGNMENT_OVERLAYS.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Testing](docs/TESTING.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Roadmap](docs/ROADMAP.md)

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
