# Release notes

## 0.1.2 Beta

### Explorer

- **File operations**: New File and New Folder (named in place), Rename (F2),
  Duplicate (Ctrl+D), Cut, Copy and Paste (Ctrl+X, C, V), drag and drop into
  folders, Copy Path, Copy Relative Path and Reveal in File Explorer.
- **Delete** moves to the Recycle Bin, after asking. If an open file has
  unsaved changes, the dialog says so.
- **Properties**: type, language, location, size, lines, created and
  modified dates; folders count their files. The selected file's size and
  lines also show under the tree.
- **Live updates**: files added, removed or changed by other programs appear
  at once.
- **Hidden files**: Settings > Files lets you hide Racket build output,
  backups, dot files, system files and tool folders, or your own patterns
  such as `*.log` or `drafts/`. The eye button shows them for a moment.
- Open tabs follow a renamed or moved file. File operations work only inside
  the open folder and never overwrite a file.

### Browser tabs

- **View > Open Browser Tab** (Ctrl+Shift+B) opens a web page in a tab, so
  the assignment page and your code can sit side by side (View > Open
  Browser Tab to the Side). Address bar, Back, Forward, Reload and Open in
  your web browser; recent addresses are suggested.
- Pages cannot see your files or use PhDRacket, and only web pages (http,
  https) open. Links that open a new window open a new browser tab.

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
