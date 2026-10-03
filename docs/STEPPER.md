# Stepper

PhDRacket's Stepper is the **official HtDP stepper** from htdp-lib, driven
without DrRacket's GUI. PhDRacket does not implement any reduction rules.

```
StepperPanel (frontend/stepper/)
    │  step / stepper-finished events (typed protocol)
    ▼
Engine::step (backend/src/engine.rs): a dedicated Racket process
    │
    ▼
Stepper adapter (backend/racket/private/stepper-adapter.rkt)
    │
    ▼
stepper/private/model `go` (htdp-lib, Racket 9.3)
```

## Backend integration

`handle-step` in the bridge:

1. sets up the teaching language exactly as for Run (`setup-teaching!`, which
   mirrors `htdp-langs.rkt` `on-execute` and `front-end/complete-program`);
2. calls `go` from `stepper/private/model` with:
   - a **program expander** equivalent to DrRacket's
     `drracket/private/eval.rkt` `expand-program`: it calls `init`, sets
     `error-value->string-handler` and `current-print` as `stepper-tool.rkt`
     does, reads each expression from `expand-teaching-program` and passes
     `(expand expr)` to the model's `iter`;
   - a no-op dynamic requirer (htdp languages' `front-end/finished-complete-program`);
   - **render settings** from `get-render-settings` (`stepper/private/model-settings`)
     with the language's `render-value` and `stepper:render-to-sexp`
     (`print-convert` under the htdp print settings), let-lifting, and
     `show-lambdas-as-lambdas?` per language;
3. renders every `Before-After-Result`, `Before-Error-Result` and
   `Error-Result` to text. Rendering mirrors
   `stepper/private/mred-extensions.rkt`: `strip-to-sexp` with the highlight
   table, then `pretty-write` with the language's pretty-print hooks;
   highlighted sub-expressions become `[start, end)` character ranges
   instead of editor styles.

Each step carries the source position and span of the expression being
reduced (`Posn-Info`), used to highlight it in the editor.

All steps are collected (up to 5000), so Previous/Next/Run to End are
instant. The Stepper runs in its own process, separate from Interactions.

### Official interfaces used

| Interface | Stability |
|---|---|
| `stepper/private/model`: `go` | internal to htdp-lib |
| `stepper/private/model-settings`: `get-render-settings` | internal |
| `stepper/private/shared-typed`: result structs, `Posn-Info` | internal |
| `stepper/private/syntax-hider`: `sstx-s` | internal |
| `stepper/private/syntax-property`: `stepper-syntax-property` | internal |
| `lang/run-teaching-program`: `expand-teaching-program` | stable |
| `htdp/bsl/runtime`: `configure/settings` | stable |

The internal interfaces are confined to `stepper-adapter.rkt` and must be
re-verified on every Racket upgrade (the Stepper golden tests do this).

## Supported languages

From `htdp-langs.rkt` (Racket 9.3): Beginning Student, Beginning Student with
List Abbreviations, Intermediate Student, and Intermediate Student with lambda.
**Advanced Student is not supported by DrRacket's stepper**, and PhDRacket
reports that instead of attempting it.

`#lang htdp/bsl`, `htdp/bsl+`, `htdp/isl` and `htdp/isl+` files are stepped
the way DrRacket's module language does it (`lang/private/sl-stepper-button.rkt`):
render settings come from the language's own reader `options`
(`options->sl-runtime-settings`), let-lifting is off, the module is declared
under the file's name, and steps happen while the dynamic requirer
instantiates it (and its `test` submodule). `#lang htdp/asl` sets
`disable-stepper` and is refused.

## Providers

```
StepperProvider
├── HtDPStepper           (official; the only provider)
└── CourseStepperProvider (none exist)
```

A course profile names its provider (`shared/models/profiles.ts`). All
built-in profiles, including Waterloo CS145 and CS135, use the HtDP stepper,
and the UI calls it **HtDP Stepper**. Courses may teach written stepping
conventions that differ from this output. A course provider will be added only
when its rules are implemented and verified against course material; until
then no output is presented as a course's stepping format.

## Tests

`compatibility-tests/stepper-corpus/` holds small programs;
`compatibility-tests/expected/stepper/*.steps` records the official step
sequence for each, with highlights marked as ⟦…⟧. They are regenerated and
reviewed like the other golden transcripts (see [TESTING.md](TESTING.md)).

## Known differences from DrRacket's Stepper window

- Expressions are shown as text; DrRacket uses editor snips (images, number
  snips render textually here, as in Interactions).
- `cond` clauses print with parentheses because the stepper prints s-expressions
  (`pretty-write`); this is believed to match DrRacket but is not yet verified
  side by side.
- The print width is fixed (60 columns); DrRacket uses the window width.
- DrRacket can start stepping at the selected expression; PhDRacket starts at
  the beginning (all steps are available immediately).
