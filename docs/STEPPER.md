# Stepper

PhDRacket's Stepper is the official HtDP Stepper from htdp-lib, driven
without DrRacket's graphical interface. PhDRacket does not implement any
reduction rules itself.

```
Stepper panel (frontend/stepper/)
    │  step and stepper-finished events (typed protocol)
    ▼
Engine::step (backend/src/engine.rs), in its own Racket process
    │
    ▼
Stepper adapter (backend/racket/private/stepper-adapter.rkt)
    │
    ▼
`go` in stepper/private/model (htdp-lib, Racket 9.3)
```

## Using the Stepper

Press **Step** in the toolbar or Ctrl+Shift+Enter. PhDRacket collects every
step of the program and opens the Stepper panel. Navigate with the buttons or
the keyboard:

| Key | Action |
|---|---|
| Right arrow or Down arrow | Next step |
| Left arrow or Up arrow | Previous step |
| Home | First step |
| End | Last step |
| Enter | Go to the source of the current step |

The expression being reduced is highlighted in the Before column and in the
editor. Its result is highlighted in the After column. The Previous, Next and
Run to End buttons become available once the Stepper has produced steps.

## Integration

### Files with DrRacket metadata

The bridge's `handle-step`:

1. Configures the teaching language exactly as for Run (`setup-teaching!`,
   which mirrors `on-execute` and `front-end/complete-program` in
   `htdp-langs.rkt`).
2. Calls `go` from `stepper/private/model` with:
   - A program expander equivalent to `expand-program` in
     `drracket/private/eval.rkt`. It calls the model's initialization, sets
     `error-value->string-handler` and `current-print` as `stepper-tool.rkt`
     does, reads each expression from `expand-teaching-program` and passes
     the expanded expression to the model.
   - An empty dynamic requirer, as for the HtDP languages in DrRacket.
   - Render settings from `get-render-settings`, using the language's value
     printer, `print-convert` under the HtDP print settings, let-lifting, and
     the language's setting for showing `lambda` expressions.
3. Renders each result to text. Rendering mirrors
   `stepper/private/mred-extensions.rkt`: `strip-to-sexp` with the highlight
   table, then `pretty-write` with the language's pretty-print hooks.
   Highlighted subexpressions become character ranges instead of editor
   styles.

### Files with `#lang htdp/...`

`#lang htdp/bsl`, `htdp/bsl+`, `htdp/isl` and `htdp/isl+` files are stepped
the way DrRacket's module language steps them
(`lang/private/sl-stepper-button.rkt`):

- Render settings come from the language's own reader options, through
  `options->sl-runtime-settings`.
- Let-lifting is off.
- The module is declared under the file's name, and the steps occur while it
  is instantiated, including its `test` submodule.

### Results

Each step carries the source position and span of the expression being
reduced, which the editor uses for highlighting. Up to 5000 steps are
collected, so moving backward and forward is immediate. The Stepper runs in
its own process and does not affect Interactions.

### Interfaces used

| Interface | Status |
|---|---|
| `stepper/private/model` (`go`) | Internal to htdp-lib |
| `stepper/private/model-settings` (`get-render-settings`) | Internal |
| `stepper/private/shared-typed` (result structures, `Posn-Info`) | Internal |
| `stepper/private/syntax-hider` (`sstx-s`) | Internal |
| `stepper/private/syntax-property` (`stepper-syntax-property`) | Internal |
| `lang/run-teaching-program` (`expand-teaching-program`) | Stable |
| `htdp/bsl/runtime` (`configure/settings`, `options->sl-runtime-settings`) | Stable |

The internal interfaces are used only in `stepper-adapter.rkt` and the bridge.
They must be verified again after every Racket upgrade; the expected Stepper
sequences in the test suite do this.

## Supported languages

| Language | Metadata file | `#lang` file |
|---|---|---|
| Beginning Student | Supported | Supported (`htdp/bsl`) |
| Beginning Student with List Abbreviations | Supported | Supported (`htdp/bsl+`) |
| Intermediate Student | Supported | Supported (`htdp/isl`) |
| Intermediate Student with lambda | Supported | Supported (`htdp/isl+`) |
| Advanced Student | Not supported | Not supported (`htdp/asl`) |

DrRacket 9.3 does not support stepping Advanced Student programs, and
PhDRacket reports this instead of attempting it.

## Providers

```
StepperProvider
├── HtDPStepper            Official; the only provider
└── CourseStepperProvider  None exist
```

Each course profile names its Stepper provider in
`shared/models/profiles.ts`. All built-in profiles, including Waterloo CS145
and CS135, use the HtDP Stepper, and the interface calls it *HtDP Stepper*.
A course may teach written stepping conventions that differ from this output.
A course provider will be added only when its rules have been implemented and
verified against course material. Until then, no output is presented as a
course's stepping format.

## Tests

`compatibility-tests/stepper-corpus/` contains small programs, and
`compatibility-tests/expected/stepper/` records the official step sequence for
each one, with highlighted expressions marked by ⟦ and ⟧. These files are
regenerated and reviewed like the other expected transcripts. See
[Testing](TESTING.md).

## Known differences from DrRacket's Stepper window

- Expressions are shown as text. DrRacket shows images and some numbers
  graphically.
- `cond` clauses are printed with parentheses because the Stepper prints
  s-expressions with `pretty-write`. This is expected to match DrRacket but
  has not been verified side by side.
- The print width is fixed at 60 columns. DrRacket uses the window width.
- DrRacket can start at a selected expression. PhDRacket always starts at the
  beginning, and every step is available immediately.
