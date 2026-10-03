# Design principles

This document explains the reasoning behind PhDRacket's design, so that the
application itself can stay short and operational.

## Racket defines the semantics

Racket and the HtDP teaching languages decide what a program means.
PhDRacket changes the experience of writing a program, never the program
itself. There is no reimplementation of Racket in TypeScript or Rust: the user
interface displays results, the backend manages processes and files, and the
official runtime evaluates programs.

When an implementation must choose between an approximate but convenient
approach and a plain but compatible one, PhDRacket chooses the compatible one.
When structured information cannot be obtained reliably, PhDRacket shows
Racket's own output instead of an interpretation of it.

## Three questions for every feature

1. Does it change what a student's program means? If so, it is rejected,
   unless it is part of the official runtime.
2. Could it bypass a pedagogical or assignment restriction? If so, it is
   redesigned or rejected.
3. Does it only make editing easier? If so, it is probably appropriate.

| Appropriate | Not appropriate |
|---|---|
| Multiple cursors, search, bracket matching, syntax highlighting, go to definition, completion from the current scope | Running Beginning Student code as full Racket, solving assignments, guessing private tests, generating solutions |

## Source files belong to the student

Course files remain plain-text `.rkt` files that open unchanged in DrRacket.
PhDRacket never adds headers, markers, region delimiters or metadata, and
saving an unedited file writes back the same bytes. IDE data such as
profiles, assignment regions and settings is stored in a `.phdracket` folder
or in application storage.

## Two kinds of restriction

Language restrictions, such as those of Beginning Student or Intermediate
Student, are enforced by Racket and reported as Racket reports them.

Course and assignment rules are pedagogical, can change from one assignment
to the next, and are checked only when an explicit profile lists them. They
are always labeled as course rule warnings. PhDRacket never concludes that an
assignment allows something because Racket accepts it, and it never invents
rules.

## Academic integrity

PhDRacket improves the mechanics of writing code without doing the student's
reasoning. It has no code generation, no AI completion, no automatic fixes for
program logic, no access to grading systems and no attempt to infer private
tests. Submission Preflight, when implemented, will check file properties
only and will never comment on grades.

## Professional tools for students

A course may restrict which language concepts its students use. That is no
reason to restrict them to weak navigation, search, fonts or keyboard support.
PhDRacket preserves pedagogical constraints and removes accidental usability
constraints.

## A calm interface

- Labels are short and operational, for example *CS145*, *Racket 9.3*,
  *Stepper* and *Expected Racket 9.3*.
- The interface does not explain the project's philosophy. These documents do.
- Status bar indicators, badges and the Problems panel are used instead of
  banners.
- Dialogs appear only when the user must decide something, such as closing a
  file with unsaved changes or saving edited language metadata.
- The editor stays visually dominant, and panels can be hidden.

## Local and private

PhDRacket requires no account, uploads nothing and collects no telemetry.
Student code stays on the student's computer. The only network requests are
the optional update check, which asks GitHub whether a newer release exists,
and downloading the official Racket installer when the user asks PhDRacket to
install Racket.

## Simple setup

A student should be able to install PhDRacket and start working without
configuring anything. The first launch shows one Setup dialog in which every
choice already has a sensible default: the course profile, the Racket
installation and the theme. When Racket is missing, PhDRacket installs the
official distribution itself instead of sending the student to another
website.
