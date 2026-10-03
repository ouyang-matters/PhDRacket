# Racket integration

PhDRacket uses an official Racket installation. It does not bundle or modify
Racket. How programs are run inside it is described in
[ARCHITECTURE.md](ARCHITECTURE.md); the Stepper in [STEPPER.md](STEPPER.md).

## Discovery

At startup PhDRacket looks for `racket` (`racket.exe` on Windows):

1. on `PATH`;
2. in standard locations:
   - Windows: `%ProgramFiles%\Racket`, `%ProgramFiles(x86)%\Racket`,
     side-by-side folders such as `Racket-9.3` or `Racket v9.3`, and
     `%LOCALAPPDATA%\Programs\Racket`;
   - macOS: `/Applications/Racket v*/bin`, `~/Applications/Racket*/bin`,
     Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`);
   - Linux: `/usr/bin`, `/usr/local/bin`, `/usr/racket/bin`, `/snap/bin`,
     `~/racket/bin`, `/opt/racket*/bin`, `/usr/local/racket*/bin`.

Each candidate is probed with `racket -I racket/base -e …` for its version,
virtual machine, and whether htdp-lib (the teaching languages) is installed.
The first installation with htdp-lib is used unless the user chose one
(status bar → runtime → *Use* / *Choose another installation*). The choice is
saved in the per-user settings.

If the active course profile expects a specific version, a mismatch is shown
on the status bar (`Racket 9.4 ⚠`, tooltip `Expected Racket 9.3`). It is a
warning, never a refusal: small differences between Racket versions can
change error messages or printing, so students should know which version
actually ran their code.

## The bridge

The bridge (`backend/racket/`) is embedded in PhDRacket. For each Racket
installation it is written to

```
<local app data>/io.github.ouyang-matters.phdracket/bridge/<hash>/
```

and compiled there once with that installation's `raco make`. The hash covers
the bridge source and the installation (path, version, VM), so upgrading
either recompiles automatically. Compilation takes a few seconds the first
time. Only the bridge's own files are compiled; everything else is loaded
from the installation's existing compiled files.

## Processes

- One process per Run (see [ARCHITECTURE.md](ARCHITECTURE.md)), and a separate
  one per Stepper session.
- One spare process, started ahead of time with the teaching-language
  libraries loaded, so Run does not wait for library loading (about 1.5 s
  on a typical machine with Racket 9.3 CS).
- Stop terminates the running process.
- On Windows, processes are started without a console window.

## Settings and data locations

| What | Where |
|---|---|
| Settings (`settings.json`: runtime choice, recent files, UI preferences) | per-user config directory |
| Compiled bridge | per-user local data directory |

Nothing is written into the folders that contain your source files, apart
from the source files you save. (A save writes a temporary file next to the
target and renames it over the target, so an interrupted save never leaves a
truncated file.)

## Privacy

PhDRacket works offline. It does not upload code, require an account, or
collect telemetry.
