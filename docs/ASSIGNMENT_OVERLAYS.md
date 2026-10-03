# Assignment overlays

**Status:** designed, not yet implemented. This is Phase 3 of the
[roadmap](ROADMAP.md).

## Principle

Assignment regions are editor decorations. They never become characters in a
`.rkt` file.

Problem boxes such as "Problem f", focus dimming, gutter markers and links are
drawn with Monaco decorations, view zones and gutter decorations. Adding,
moving, hiding or deleting a region changes only what is displayed and the
metadata files described below. The source text, and therefore the bytes
written on save, are never affected. Tests enforce this.

## Data storage

```
<assignment folder>/.phdracket/
├── workspace.json
├── assignments/
│   └── A3.json        Imported specification and parsed problems
└── regions/
    └── A3b.json       Links between problems and code in A3b.rkt
```

The `.phdracket` folder is not part of any source file and should not be
submitted. PhDRacket can also keep this data in application storage instead.

## Importing an assignment

1. Pasted text, plain text files and Markdown are supported first.
2. HTML, PDF and course web pages may follow, where technically appropriate.

The imported text is divided into problems (a, b, c and so on) by simple,
visible rules, such as headings and "Problem x" or "Question x" patterns. The
student can correct the result. Imported text is stored separately and is
never inserted into code.

## Anchoring regions to code

Line numbers change as students edit, so each region stores several
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
        "context": { "before": "...", "after": "..." },
        "offset": { "start": 812, "end": 1044 },
        "textHash": "..."
      }
    }
  ]
}
```

When a file is opened or edited, PhDRacket resolves each region in this
order:

1. **Live tracking.** While the file is open, a Monaco tracked range follows
   every edit.
2. **Defined symbol.** The top-level definition named by `symbol`. It must be
   unique in the file.
3. **Surrounding context.** Used to choose between candidates.
4. **Offset.** Used only when the text at the stored offset still matches the
   stored hash.

If no rule gives a single confident answer, the region is shown as
*unlinked*. It is never attached to whatever code happens to be nearby. The
student can link it again with *Link to selection*. When a symbol is renamed
with the IDE's rename command, the anchor is updated as well.

## Required tests

- Adding, moving, hiding and deleting regions causes no change to any source
  file, verified by byte comparison.
- After linking Problem f to `tree-height` and inserting ten lines above it,
  the region still covers `tree-height`.
- After renaming `tree-height` with the IDE, the region follows the new name.
- After deleting the function, the region becomes unlinked.
- When two definitions have the same name, the region is shown as unlinked.

## Assignment panel

```
A3
✓ a
✓ b
  c
```

The student sets completion marks, or PhDRacket infers them conservatively
when associated code and tests exist. A mark never claims that a solution is
correct.
