# Release notes

## 0.1.1 Beta

A new workbench: PhDRacket now works like a full desktop IDE. Programs still
run in your installed Racket, exactly as before, and `.rkt` files are still
saved byte for byte.

### Workbench

- **Menus**: File, Edit, Selection, View, Go, Run, Tools and Help.
- **Command palette** (Ctrl+Shift+P) and **Go to File** (Ctrl+P): every
  command is searchable, with its keyboard shortcut.
- **Split editors**: Split Right (Ctrl+\\) and Split Down, nested as you like.
  A file open in two editors is one buffer, so changes appear in both.
- **Tabs**: drag to reorder or into another group; right-click for Close
  Others, Close to the Right, Split and Move into New Group; Reopen Closed
  Editor (Ctrl+Shift+T).
- **Sidebar** with Explorer and Search (**Find in Files**, Ctrl+Shift+F).
- **Panels** (Problems, Tests, Interactions, Stepper, Output) can be
  maximized and hidden (Ctrl+J).
- **Editor**: Go to Symbol (Ctrl+T) and Go to Definition (F12) within a file,
  Select Enclosing S-expression (Ctrl+Alt+Up), multiple cursors, line moves.

### Appearance

- **Themes**: PhDRacket Light and Dark, Midnight, Paper, High Contrast Dark
  and Light, and two unofficial community themes, Waterloo Math Pink and
  Waterloo Black & Gold. Every theme is checked for readable contrast.
  Settings > Appearance shows previews; Preferences: Color Theme previews as
  you move through the list.
- A short startup screen, which never delays startup (Full, Reduced or Off).

### Settings

- Settings has pages: General, Appearance, Editor, Files and Keyboard
  Shortcuts.
- **Keyboard shortcuts** can be changed; conflicts are marked.
- **Auto save**: off, after a delay, when the editor loses focus, or when the
  window loses focus.
- Separate switches for closing brackets, closing quotes, and word
  completion (off by default).

### Other changes

- Closing or quitting with unsaved files asks in a new dialog with **Save**
  (Save All), **Don't Save** and **Cancel**.
- When a new version is available, PhDRacket shows it at startup.
- Until the Beta Terms of Use are accepted, nothing but Setup can be used.
- **Run Remotely** (optional): run long programs on your own SSH hosts, with
  a Tasks panel. Run always stays on your computer.

### Updating

Copies of 0.1.0-beta.1 show an *Update 0.1.1* button in the status bar a few
seconds after startup; click it, or use About > Check for updates. You can
also use the Quick install command or the installer from the release page.

## 0.1.0-beta.1

First public beta: the Racket bridge with official HtDP semantics,
Definitions and Interactions, the Tests panel, the official HtDP Stepper,
tabs and a folder explorer, Choose Language, course profiles, the Setup
dialog with Racket installation, and updates. This version is outdated; use
0.1.1 Beta.
