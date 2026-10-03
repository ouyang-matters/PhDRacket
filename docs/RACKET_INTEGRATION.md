# Racket integration

PhDRacket uses an official Racket installation. It does not bundle or modify
Racket. [Architecture](ARCHITECTURE.md) describes how programs run inside the
installation, and [Stepper](STEPPER.md) describes the Stepper.

## Runtime discovery

At startup PhDRacket looks for the `racket` executable (`racket.exe` on
Windows) in these places, in order:

1. Every directory on `PATH`.
2. Standard installation locations:

| System | Locations |
|---|---|
| Windows | `%ProgramFiles%\Racket`, `%ProgramFiles(x86)%\Racket`, versioned folders such as `Racket-9.3` or `Racket v9.3`, `%LOCALAPPDATA%\Programs\Racket` |
| macOS | `/Applications/Racket v*/bin`, `~/Applications/Racket*/bin`, `/opt/homebrew/bin`, `/usr/local/bin` |
| Linux | `/usr/bin`, `/usr/local/bin`, `/usr/racket/bin`, `/snap/bin`, `~/racket/bin`, `/opt/racket*/bin`, `/usr/local/racket*/bin` |

PhDRacket runs each candidate once with `racket -I racket/base -e` to read its
version, its virtual machine, and whether the HtDP teaching languages
(htdp-lib) are installed. It uses the first installation that has htdp-lib,
unless the user has chosen one. To choose, click the Racket version in the
status bar. The choice is saved in the user settings.

### Version mismatches

When the active course profile expects a Racket version and a different
version is running, the Racket item in the status bar is shown in the warning
color and its tooltip reads, for example, "Expected Racket 9.3". PhDRacket
still runs programs. Different Racket versions can differ slightly in error
messages and printing, so students should know which version ran their code.

## The bridge

The bridge (`backend/racket/`) is embedded in PhDRacket. For each Racket
installation it is written to

```
<local application data>/io.github.ouyang-matters.phdracket/bridge/<hash>/
```

and compiled there once with that installation's `raco make`. The hash covers
the bridge source and the installation's path, version and virtual machine,
so a new PhDRacket version or a different Racket installation is compiled
automatically. The first compilation takes a few seconds. Only the bridge's
own files are compiled; all libraries are loaded from the installation.

## Processes

| Process | Lifetime |
|---|---|
| Run | One per Run. The next Run or Stop ends it. |
| Stepper | One per Stepper session, independent of Interactions. |
| Spare | One process started in advance with the teaching-language libraries loaded, so Run does not wait for them (about 1.5 seconds with Racket 9.3 CS). |

On Windows, processes start without a console window.

## Data locations

| Data | Location |
|---|---|
| Settings: runtime choice, recent files, open folder, preferences | `settings.json` in the per-user configuration directory |
| Compiled bridge | Per-user local application data directory |

PhDRacket writes nothing into your folders except the source files you save.
A save writes a temporary file next to the target and renames it over the
target, so an interrupted save never leaves a truncated file. Opening a folder
in the Explorer only reads it.

## Network access and privacy

PhDRacket does not upload code, does not require an account and collects no
telemetry. Its only network request is the update check: at startup it
downloads a small manifest from the project's GitHub repository to see whether
a newer release exists. The request contains no information about your files.
Turn it off in Settings with *Check for updates on startup*; you can still
check manually from the About dialog. Updates are signed, and an update is
downloaded and installed only after you confirm it.
