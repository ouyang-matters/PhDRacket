# Course profiles and modes

The status bar's leftmost item (for example **CS145 ▾**) selects the active
profile. Profiles are defined in `shared/models/profiles.ts`.

| Profile | Mode | Expected Racket | New files | Stepper | Preflight |
|---|---|---|---|---|---|
| Waterloo CS145 | Course | 9.3 | Beginning Student | HtDP Stepper | yes |
| Waterloo CS135 | Course | (not set, unconfirmed) | Beginning Student | HtDP Stepper | yes |
| Generic HtDP | HtDP | — | Beginning Student | HtDP Stepper | no |
| Racket | Racket | — | `#lang racket` | HtDP Stepper (teaching files only) | no |

**A profile never changes what a program means.** The language always comes
from the file. A profile configures the environment only: the expected
runtime version (mismatches appear as "Expected Racket 9.3" on the status
bar), the default language for *New file*, which tools are offered, which
Stepper provider is used, and (later) assignment profiles, course-rule
warnings and submission checks.

Switching profiles never rewrites the open file; the end-to-end test checks
this.

Values are only included when known. CS135's Racket version has not been
confirmed, so the CS135 profile does not set one rather than guessing.

## Modes

- **Course**: a specific course profile (CS145, CS135). Course tools such as
  Submission Preflight and, later, assignment profiles.
- **HtDP**: the HtDP teaching languages, tests, Stepper and Interactions with
  no course-specific behavior.
- **Racket**: general Racket programming with `#lang racket` and ordinary
  modules; course-specific behavior is off.

## Two layers of restriction

**Layer A, the language** (BSL, ISL, …): enforced by Racket and reported as
Racket reports it. A file is never run in a more permissive language.

**Layer B, course and assignment rules**: not enforced by Racket. Reported only
when an explicit assignment profile lists them, as **Course Rule Warnings**,
visibly distinct from Racket errors, and never preventing a save. PhDRacket
does not infer such rules and does not invent them.

## Assignment profiles (planned)

```json
{
  "assignment": "A3",
  "requiredFiles": ["A3a.rkt", "A3b.rkt"],
  "courseWarnings": { "disallowedForms": [] }
}
```

Assignment profiles are separate from course profiles. They contain only
explicitly configured information, never grading data, and live in
`.phdracket/` or application storage, never in source files.

## Profile format

```json
{
  "id": "waterloo-cs145",
  "name": "Waterloo CS145",
  "runtime": { "expectedVersion": "9.3" },
  "tools": { "stepper": true, "tests": true, "interactions": true }
}
```

(The built-in TypeScript definitions follow this shape. User-defined profile
files are planned.)
