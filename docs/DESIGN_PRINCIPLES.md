# Design principles

These explanations live here so the application itself can stay quiet.

## Same Racket semantics. Modern development environment.

Racket and HtDP decide what a program means. PhDRacket changes the
experience of writing the program, never the program. There is no Racket
reimplementation in TypeScript or Rust: the frontend renders, the backend
manages processes and files, and the official runtime evaluates.

When an implementation choice is between *clever but approximate* and
*boring but compatible*, PhDRacket takes the compatible one. When structured
information cannot be obtained reliably, it shows Racket's raw output rather
than inventing an interpretation.

## Three questions for every feature

1. Does it change what the student's program means? If so, reject it, unless
   it is part of the official runtime.
2. Could it bypass a pedagogical or assignment restriction? If so, redesign or
   reject it.
3. Does it only make editing easier? Then it is probably appropriate.

| Feature | |
|---|---|
| multiple cursors, search, bracket matching, highlighting, go-to-definition, lexical completion | yes |
| running BSL as full Racket, assignment solving, guessing private tests, generated solutions | no |

## Source files are the student's

Course files stay plain-text `.rkt` files that open unchanged in DrRacket.
PhDRacket never adds headers, markers, region delimiters or metadata, and
saving an unedited file writes back the same bytes. IDE state (profiles,
assignment regions, settings) lives in `.phdracket/` or application storage.

## Two kinds of restriction

*Language* restrictions (BSL, ISL, …) are enforced by Racket and reported as
Racket reports them. *Course/assignment* rules are pedagogical, may change
per assignment, and are only checked when an explicit profile lists them,
always labeled as course-rule warnings. PhDRacket never infers that "Racket
accepts it" means "the assignment allows it", and never invents rules.

## Academic integrity

PhDRacket improves the mechanics of writing code without doing the student's
reasoning. It has no code generation, no AI completion, no automatic fixes for
logic, no access to grading systems, and no attempt to infer private tests.
Submission Preflight checks file mechanics only and never claims a grade.

## Professional students

Courses may restrict which language concepts students use. They do not need
to restrict students to poor navigation, fonts, search or keyboard support.
Pedagogical constraints are preserved; accidental UX constraints are removed.

## A calm interface

- Concise operational labels: *CS145*, *Racket 9.3*, *Stepper*, *Expected
  Racket 9.3*.
- No in-app explanations of philosophy; that is what these documents are for.
- Status-bar indicators, badges and the Problems panel instead of banners.
- Modal dialogs only for decisions (unsaved changes, saving edited language
  metadata).
- The editor stays visually dominant; panels can be hidden.

## Local-first and private

No account, no uploads, no telemetry unless a future opt-in is added.
Student code stays on the student's computer.
