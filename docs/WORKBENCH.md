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

## Settings and dialogs

Settings (File > Preferences > Settings, Ctrl+,) has pages: General (course
profile, update checks, startup animation, remote hosts), Appearance (theme
cards with previews, layout, motion), Editor (font, automatic closing of
brackets and quotes, word completion, display), Files (auto save: off, after a
delay, when the editor loses focus, or when the window loses focus) and
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
