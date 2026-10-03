# Course profiles and modes

The first item in the status bar, for example **CS145**, shows the active
profile. Click it to choose another. The profiles are defined in
`shared/models/profiles.ts`.

| Profile | Mode | Expected Racket | Language for new files | Stepper |
|---|---|---|---|---|
| Waterloo CS145 | Course | 9.3 | Beginning Student | HtDP Stepper |
| Waterloo CS135 | Course | Not set | Beginning Student | HtDP Stepper |
| Generic HtDP | HtDP | Not set | Beginning Student | HtDP Stepper |
| Racket | Racket | Not set | `#lang racket` | HtDP Stepper, for teaching-language files |

## What a profile affects

A profile configures the environment. It never changes what a program means:
the language always comes from the file, and switching profiles never changes
the open file.

At present a profile affects:

- **The language preselected in the New File dialog.**
- **The Racket version check.** When the profile expects a version and a
  different one is running, the status bar shows the Racket version in the
  warning color with the tooltip "Expected Racket 9.3".

Profiles will also select assignment profiles, course rule warnings and
Submission Preflight once those features exist.

Values are set only when they are known. The Racket version used by CS135 has
not been confirmed, so the CS135 profile does not set one.

## Modes

| Mode | Purpose |
|---|---|
| Course | A specific course, such as CS145 or CS135. Course tools such as assignment profiles and Submission Preflight will appear only in this mode. |
| HtDP | The HtDP teaching languages, tests, Stepper and Interactions, without course-specific behavior. |
| Racket | General Racket programming with `#lang racket` and ordinary modules. |

## Two kinds of restriction

**Language restrictions** apply to the teaching languages: Beginning Student,
Intermediate Student and the others. Racket enforces them, and PhDRacket
reports them exactly as Racket does. A file never runs in a more permissive
language than it declares.

**Course and assignment rules** are restrictions a course adds beyond the
language. Racket does not enforce them. PhDRacket will report them only when
an explicit assignment profile lists them. They will be labeled
*Course Rule Warning*, kept separate from Racket errors, and will never
prevent saving. PhDRacket does not infer such rules and does not invent them.

## Assignment profiles (planned)

An assignment profile contains only explicitly configured information and
never contains grading data:

```json
{
  "assignment": "A3",
  "requiredFiles": ["A3a.rkt", "A3b.rkt"],
  "courseWarnings": { "disallowedForms": [] }
}
```

Assignment profiles are separate from course profiles. They are stored in a
`.phdracket` folder or in application storage, never in source files.

## Profile format

The built-in profiles follow this structure:

```json
{
  "id": "waterloo-cs145",
  "name": "Waterloo CS145",
  "runtime": { "expectedVersion": "9.3" },
  "tools": { "stepper": true, "tests": true, "interactions": true }
}
```

User-defined profile files are planned.
