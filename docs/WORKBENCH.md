# The workbench

PhDRacket's user interface is a desktop IDE workbench:

```
┌──────────────────────────────────────────────────────────────┐
│ File Edit Selection View Go Run Tools Help   [ Go to File ]  │  menu bar
├──┬───────────┬───────────────────────────┬───────────────────┤
│  │           │ editor group 1            │ editor group 2    │
│ A│  Sidebar  │ a3.rkt  notes.rkt   ▶ Run │ a3.rkt            │  editor area
│ c│ (Explorer,│                           │                   │  (split layout)
│ t│  Search)  │                           │                   │
│  │           ├───────────────────────────┴───────────────────┤
│  │           │ Problems  Tests  Interactions  Stepper  Output │  bottom panel
├──┴───────────┴───────────────────────────────────────────────┤
│ CS145 · Beginning Student · Racket 9.3 · Local    Ln 21, Col 8│  status bar
└──────────────────────────────────────────────────────────────┘
```

Every region can be hidden (View > Appearance), and Zen Mode hides all but
the editors.

## Commands

Every user action is a **command** with a stable id
(`frontend/commands/registry.ts`), such as `file.save`,
`view.splitEditorRight` or `run.run`. A command has a title, a category, an
optional icon, `run`, and optionally `enabled`, `visible`, `checked` and a
default keybinding.

The menu bar, the command palette (Ctrl+Shift+P), keybindings, toolbar
buttons and context menus all invoke commands by id. No action has a second
implementation. The built-in commands and their menu placement are in
`frontend/workbench/builtin-commands.tsx`.

Commands for features that do not exist yet (a Racket formatter, Go to
References, Back and Forward) are registered as hidden, so the architecture
is ready but no broken menu item appears.

### Keybindings

`frontend/commands/keybindings.ts`. Keys are written `Mod+Shift+P`, where Mod
is Ctrl, or Cmd on macOS. A command may have a macOS-specific default and
alternate keys (Run: Ctrl+Enter, F5, Ctrl+R).

One window-level dispatcher handles workbench keys before the editors see
them. Keys the editor owns (typing, undo, clipboard, find, multi-cursor,
line moves) are marked `nativeKey`: they are displayed in menus but left to
Monaco. A command can be limited to a focus context (`when`): Run's
Ctrl+Enter does not apply in the Interactions input, where Ctrl+Enter submits.

File > Preferences > Keyboard Shortcuts lists every command; clicking a key
records a new one. Overrides are stored in `preferences.keybindings`.

### Menus

Menus are data (`frontend/commands/menus.ts`): items point at commands or
submenus and are grouped; groups are separated. Menus with no visible items
disappear. Providers compute items when a menu opens (Open Recent, remote
hosts). The menu bar and context menus render the same model
(`frontend/workbench/MenuList.tsx`).

## Editor groups and splits

`frontend/workbench/layout.ts` models the editor area as a tree:

```
SplitNode { orientation: "row" | "column", children, sizes }
GroupNode { groupId }                     an editor group with tabs
```

Split Right adds a group beside the active one, Split Down below it;
splitting again in the same direction adds a sibling, otherwise the tree
nests (for example `A | (B / C)`). Closing a group's last tab removes the
group and returns its space to its neighbor. Layout presets (Single, Two
Columns, Two Rows) keep every open tab. The model is pure and covered by
`layout.test.ts`, including a randomized invariant check.

A tab refers to a document. A document open in several groups is one
Monaco model shown by several editors, so edits appear everywhere at once
and unsaved state is shared; there is never a second buffer. Each group has
its own editor, cursor and scroll position.

Tabs can be dragged to reorder them or onto another group. The tab context
menu offers Close, Close Others, Close to the Right, Split, Move into New
Group and Copy Path. Reopen Closed Editor (Ctrl+Shift+T) reopens recently
closed files.

The store keeps `activeId`, `activeDoc`, `openPath`, `closeDoc` and
`activate` with their previous meaning: `activeId` is the active group's
document.

## Views and panels

Sidebar views (`frontend/workbench/sidebar.tsx`) and bottom panels
(`frontend/workbench/panels.tsx`) are registered, built-in or not. The
panel framework provides switching, closing (Ctrl+J), maximizing and
resizing; a panel can keep its state while hidden (Interactions does) and
can be offered conditionally (Tasks appears once a remote host exists).

The sidebar can show two views stacked, for example the Explorer above the
Outline: View > Appearance > Split Sidebar, or right-click a view's icon in
the activity bar and choose Show Below. Drag the line between them to
resize (double-click it for half and half). Right-click a view's title for
Swap Sidebar Views and Close Lower Sidebar View; clicking the icon of the
lower view closes it. Which views are shown and the split are remembered
(`sidebarView`, `sidebarBottomView`, `sidebarSplit`); the placement rules
are in `frontend/workbench/sidebar-layout.ts`.

## Explorer

The Explorer (`frontend/explorer/`) shows the open folder. Its file
operations go through `backend/src/files.rs`, which refuses any path outside
the open folder, never overwrites an existing name, and deletes only to the
Recycle Bin (Trash):

- **New File**, **New Folder** and **Rename** (F2) type the name in place.
- **Duplicate** (Ctrl+D), **Cut**, **Copy** and **Paste** (Ctrl+X, C, V), and
  drag and drop onto a folder. Copies get a fresh name ("a3 copy.rkt").
- **Delete** asks in the app, and says when an open file has unsaved changes.
- **Copy Path**, **Copy Relative Path**, **Reveal in File Explorer**,
  **Properties** (type, language, location, size, lines, dates, read-only;
  folders count their contents).
- Arrow keys move the selection; Enter opens. A click opens a file and keeps
  the keyboard in the tree; a double click moves to the editor. Open tabs
  follow renames and moves; a deleted file's tab closes.
- The selected file's size, lines and date show under the tree; hovering
  shows them too.
- The open folder is watched: files added, removed or changed by other
  programs appear at once.
- **Hidden files**: Settings > Files lists common groups (Racket build output,
  backups, dot files, system files, tool folders) and takes custom patterns
  (`*.log`, `drafts/`, `docs/*.pdf`). The eye button shows hidden files for a
  moment. Hiding applies to the Explorer only; Quick Open and Find in Files
  are unchanged.

## Outline

The Outline (View > Outline, in the sidebar) shows the structure of the
active file as you type: definitions with their parameters or HtDP signature
(`;; sq : Number -> Number`), structures and their fields, local
definitions, tests (with ✓/✗ from the last Run of this version of the file),
`require` and `provide`, and section comments (`;;; Question 1`,
`;; === Part 2 ===`). Clicking an item goes there; the item at the cursor is
marked; items with an error found while typing get a red dot. The header
filters, sorts by name, hides tests and collapses everything
(`frontend/outline/`).

## Source control

Source Control (View > Source Control, Ctrl+Shift+G) uses the user's own
`git` (`backend/src/git.rs`; nothing is installed). For the repository that
contains the open folder it shows:

- the branch (click to switch; New branch…), ahead/behind its upstream, and
  Fetch, Pull (fast-forward only) and Push;
- a commit box (Ctrl+Enter); with nothing staged, Commit commits every
  change;
- Staged Changes and Changes, with Stage, Unstage and Discard per file or
  for all (Discard asks first; untracked files go to the Recycle Bin);
- History: recent commits, their files, and each file's diff.

Clicking a change opens a **diff tab**: the last commit on the left, the
file itself (live and editable) on the right, with Previous/Next change and
an Inline view. Open diffs follow new commits. In the editor's margin,
added (green), changed (blue) and deleted (red) lines since the last commit
are marked; changed files are colored in the Explorer, and the status bar
shows the branch (`*` when there are changes). Nothing rewrites history: no
reset, rebase or force push. Settings > Files turns each part off.

## Checking while typing

While you type, Racket expands the program in the background with DrRacket's
own Check Syntax (`frontend/analysis/`, `backend/racket/private/analysis.rkt`).
The program is not run.

- **Errors** are underlined as you type, with the same messages Run shows
  (the teaching languages' wording), and listed at the top of Problems.
- **Unused local names** are shown faded.
- **Scopes**: placing the cursor on a name highlights where it is bound and
  every use of that binding; a local `x` and a top-level `x` are different.
- **Hover** a name: where it comes from ("imported from
  lang/htdp-beginner"), how many uses it has, and a link to its
  documentation, which opens in a browser tab beside the code.
- **Go to Definition** (F12), **Go to References** (Shift+F12) and
  **Rename** (F2) follow Racket's bindings, so renaming a parameter changes
  only that parameter.
- **Suggestions** while typing: the program's own definitions, local names in
  the same definition, then the names the language provides. Settings >
  Editor > Suggestions while typing turns automatic suggestions off;
  Ctrl+Space always shows them.

Settings > Editor > Check while typing turns checking off. Settings > Editor
> Highlighting has a switch for each kind of highlighting: the name under
the cursor, the current line, matching brackets, bracket guides, faded
unused names, error messages at the end of the line, hovers, keeping the
current definition's header visible while scrolling, and values next to the
code while debugging. Expansion runs
macros at compile time, as DrRacket does; a check is stopped after ten
seconds.

## Debugging

- **Breakpoints**: click in the margin left of the line numbers, or press F9
  on a line. A hollow marker means the line has no expression to stop at.
- **Debug** (F6, Run > Start Debugging, or the Debug button) runs the
  program and stops before evaluating an expression on a breakpoint line.
- While paused: **Continue** (F5), **Step Over** (F10, shows the value the
  expression produced), **Step Into** (F11), **Step Out** (Shift+F11),
  **Stop** (Shift+F5). **Pause** (F6) stops a running program wherever it is.
- The paused expression is highlighted, with its value after a step. The
  **Debug** panel shows the local variables of the selected frame, the call
  stack and every breakpoint; hovering a name shows its value.
- Breakpoints move with the code as it is edited and can be changed while
  debugging. After the program finishes, they still apply to Interactions.

F5 runs the program unless the debugger is paused, and F11 is Full Screen
unless the debugger is paused.

## Browser tabs

View > Open Browser Tab (Ctrl+Shift+B) opens a web page as an editor tab, so
an assignment page can sit beside the code in a split; View > Open Browser
Tab to the Side opens it in a new group at once. The tab has an address bar
(a bare address such as `student.cs.uwaterloo.ca/~cs145` becomes https),
Back, Forward, Reload and Open in your web browser, and suggests recent
addresses.

The page is a native webview (`apps/desktop/src-tauri/src/browser.rs`) kept
over its tab's area, because most course sites refuse to load in frames. It
hides while a menu, dialog or palette would overlap it. Pages:

- cannot call PhDRacket's commands (the app's capability covers only its own
  pages),
- may show only http and https pages; other links are not followed,
- open links that ask for a new window as new browser tabs.

Splitting a browser tab moves it into the new group (a page is shown in one
place at a time).

## Settings and dialogs

Settings (File > Preferences > Settings, Ctrl+,) has pages: General (course
profile, update checks, startup animation, remote hosts), Appearance (theme
cards with previews, layout, motion), Editor (font, automatic closing of
brackets and quotes, word completion, display), Files (files hidden in the
Explorer; auto save: off, after a delay, when the editor loses focus, or when
the window loses focus) and
Keyboard Shortcuts. Auto save never saves a file whose DrRacket language
lines were edited, and never an untitled file.

Closing a file or quitting with unsaved changes opens an in-app dialog with
Save (Save All when quitting with several files), Don't Save and Cancel.

When the startup update check finds a new version, the update dialog opens
by itself once no other dialog is showing. Until the Beta Terms of Use are
accepted, the menus and every keyboard shortcut are locked; only Setup works.

## Pickers

The quick input (`frontend/workbench/QuickInput.tsx`) backs the command
palette, Go to File (Ctrl+P), the theme picker, Language and Course
Profile. In Go to File, typing `>` switches to commands; in the palette, `:`
goes to a line.

## Themes and design tokens

`frontend/theme/`:

- `themes.ts`: built-in themes as data. Each defines semantic color tokens
  (`app.background`, `editor.background`, `text.secondary`,
  `accent.primary`, `test.fail`, `stepper.beforeHighlight`,
  `remote.active`, …) and a syntax palette.
- `engine.ts`: turns a theme into CSS variables (`--c-app-background`) and a
  Monaco theme. Components use only the variables, never a theme's colors.
- `apply.ts`: applies a theme to the workbench and every Monaco editor at
  once, without a restart.
- `tokens.ts`: spacing, radii, borders, shadows, motion, typography and
  sizes as CSS variables (`--space-2`, `--dur-fast`, `--size-tab`).
- `themes.test.ts`: every theme must meet WCAG AA (4.5:1) for text, test
  results, diagnostics and every syntax color, on both the editor background
  and the current-line highlight.

| Theme | Kind |
|---|---|
| PhDRacket Light, PhDRacket Dark | default light and dark |
| Midnight | dark, deep blue |
| Paper | light, warm |
| High Contrast Dark, High Contrast Light | accessibility |
| Waterloo Math Pink, Waterloo Black & Gold | unofficial community themes |

The two Waterloo-inspired themes are visual presets only. They change no
behavior, course profile or language, carry no logos or marks, are labeled
unofficial, and are never the default. The default follows the operating
system (PhDRacket Light or Dark).

A new theme is a `Theme` object added to `THEMES`; the contrast tests check
it automatically.

## Identity

- The mark (`frontend/workbench/BrandMark.tsx`): the application icon's
  mortarboard resting on a pair of parentheses, without the background tile.
  It appears in the menu bar, start page, About and startup screen. The
  interface has no decorative background graphics.
- The application icon: `apps/desktop/icon.svg` is the master. `pnpm icons`
  generates the Windows (`.ico`), macOS (`.icns`) and Linux and Store PNG
  icons in `apps/desktop/src-tauri/icons/`.
- The icon set: every interface icon comes from Lucide through one module,
  `frontend/workbench/icons.tsx`, by semantic name.
- The startup screen lives in `apps/desktop/index.html` so it paints before
  any script. It uses the last theme's colors, draws the mark once (about
  600 ms) or fades (Reduced, or when the system asks for reduced motion) or
  is skipped (Off; Settings > Startup animation), and leaves as soon as the
  workbench is ready. It never delays startup and never loops; a slow start
  shows a quiet "Starting…".

Animations elsewhere are 100 to 200 ms (menus, sidebar, new editor groups)
and are disabled by Reduce motion and by the system setting.

## Remote compute

Run always uses the local Racket bridge. For heavy work, a remote host
(Tools > Remote Compute > Configure Remote Hosts) runs the active file with
**Run Remotely**; output streams into the Tasks panel, where tasks can be
cancelled while editing continues. The status bar shows the target
(Local, or "DGX · Connected" / "DGX · Offline") and switches it.

Hosts are SSH destinations. PhDRacket runs the system `ssh` in batch mode,
so only hosts the user's own SSH keys or agent already allow are usable; it
never asks for or stores passwords and never accepts a new host key on the
user's behalf (connect once with `ssh` to verify it). Destinations and the
remote Racket command are validated so they cannot inject `ssh` options or
shell syntax. The program is copied to `~/.phdracket-remote/` on the host and
run there with `racket`.

## Extending the workbench

Optional features (such as PhDRacket Δ) extend the workbench through the same
interfaces the built-ins use, without changing workbench code:

| To add | Use |
|---|---|
| An action | `registerCommand` (`frontend/commands/registry.ts`) |
| A menu entry, e.g. under Tools | `registerMenuItems("menubar.tools", …)` or a provider |
| A bottom panel | `registerPanelView` (`frontend/workbench/panels.tsx`) |
| A sidebar view | `registerSidebarView` (`frontend/workbench/sidebar.tsx`) |
| A context menu entry on tabs | `registerMenuItems("editor.tabContext", …)` |

The workbench does not refer to any optional feature by name.
