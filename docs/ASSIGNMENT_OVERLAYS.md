# Assignment overlays

Status: **designed, not yet implemented** (Phase 3 in [ROADMAP.md](ROADMAP.md)).

## The rule

**Assignment regions are editor decorations. They never become characters in
a `.rkt` file.**

Problem boxes ("Problem f", "Problem g"), focus dimming, gutter markers and
links are drawn with Monaco decorations, view zones and gutter decorations.
Adding, moving, hiding or deleting a region changes only rendering and the
external metadata files. The source text, and therefore the bytes written on
save, are unaffected. This is enforced by tests (below).

## Where the data lives

```
<assignment folder>/.phdracket/
├── workspace.json
├── assignments/
│   └── A3.json        imported specification (text/Markdown), parsed problems
└── regions/
    └── A3b.json       problem ↔ code associations for A3b.rkt
```

`.phdracket/` is never part of a source file and should not be submitted.
PhDRacket can alternatively keep this data in application storage.

## Assignment import

1. Paste text, plain text or Markdown (first).
2. HTML, PDF and course web pages later, where technically appropriate.

The imported specification is parsed into problems (a, b, c, ...) by simple,
transparent rules (headings, "Problem x" / "Question x" patterns) that the
student can correct. Imported text is stored separately and never inserted
into code.

## Anchoring

Line numbers alone break as students edit, so each region stores several
independent anchors:

```json
{
  "assignment": "A3",
  "file": "A3b.rkt",
  "regions": [
    {
      "problem": "f",
      "anchor": {
        "symbol": "tree-height",
        "form": "define",
        "context": { "before": "…", "after": "…" },
        "offset": { "start": 812, "end": 1044 },
        "textHash": "…"
      }
    }
  ]
}
```

Resolution order when a file is opened or edited:

1. **Live tracking.** While the file is open, a Monaco tracked range follows
   edits exactly.
2. **Defined symbol.** The top-level definition whose name is `symbol`
   (found by the reader-level scanner, later by Racket's syntax information).
   It must be unique.
3. **Surrounding context**, used to disambiguate.
4. **Offset**, only as a fallback when the text at the offset still matches
   the stored hash.

If no rule gives a unique, confident answer, the region is shown as
**unlinked**. It is never attached to whatever code happens to be nearby. The
student can re-link it with *Link to selection*.

When a symbol is renamed through the IDE's rename command, the anchor is
updated with it.

## Required tests

- Adding, moving, hiding and deleting regions: **zero source-file
  modifications** (byte comparison).
- Link Problem f to `tree-height`; insert ten lines above; the region still
  covers `tree-height`.
- Rename `tree-height` through the IDE; the region follows.
- Delete the function; the region becomes unlinked.
- An ambiguous anchor (two definitions of the same name) is shown as unlinked.

## Assignment panel

```
A3
✓ a
✓ b
  c
```

Completion marks are set by the student, or inferred conservatively
(associated code and tests exist). A mark never claims the solution is correct.
