// Settings, in pages: General, Appearance, Editor, Files and Keyboard
// Shortcuts. Every change applies at once and is saved with the preferences.

import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_HIDDEN, HIDDEN_PRESETS, customPatterns, parsePatterns, presetEnabled, setPreset } from "@frontend/explorer/hidden";
import { Modal } from "@frontend/app/Modal";
import { setDialog, setPrefs, setSettingsPage, useApp } from "@frontend/app/store";
import { PROFILES } from "@shared/models/profiles";
import { THEMES, type Theme } from "@frontend/theme/themes";
import { resolveThemeChoice } from "@frontend/theme/engine";
import { KeybindingsEditor } from "@frontend/workbench/KeybindingsEditor";
import { Icon, type IconName } from "@frontend/workbench/icons";
import type { AutosaveMode, Preferences, StartupAnimation } from "./preferences";

const PAGES: { id: string; title: string; icon: IconName }[] = [
  { id: "general", title: "General", icon: "settings" },
  { id: "appearance", title: "Appearance", icon: "themes" },
  { id: "editor", title: "Editor", icon: "language" },
  { id: "files", title: "Files", icon: "save" },
  { id: "keyboard", title: "Keyboard Shortcuts", icon: "keyboard" },
];

function Check({ pref, label, hint }: { pref: keyof Preferences; label: string; hint?: string }) {
  const value = useApp((s) => s.prefs[pref]) as boolean;
  return (
    <label className="setting-check">
      <input type="checkbox" checked={value} onChange={(e) => setPrefs({ [pref]: e.target.checked } as Partial<Preferences>)} />
      <span>
        {label}
        {hint && <span className="setting-hint">{hint}</span>}
      </span>
    </label>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        {label}
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="setting-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function General() {
  const prefs = useApp((s) => s.prefs);
  return (
    <>
      <Section title="Course">
        <Row label="Course profile" hint="Sets defaults such as the expected Racket version. It never changes what a program means.">
          <select value={prefs.profile} onChange={(e) => setPrefs({ profile: e.target.value })}>
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Startup">
        <Check pref="checkForUpdates" label="Check for updates on startup" hint="Shows a window when a new version is available." />
        <Check pref="showAnnouncements" label="Show announcements" />
        <Row label="Startup animation">
          <select value={prefs.startupAnimation} onChange={(e) => setPrefs({ startupAnimation: e.target.value as StartupAnimation })}>
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
            <option value="off">Off</option>
          </select>
        </Row>
      </Section>
      <Section title="Remote compute">
        <Row label="Remote hosts" hint="Run long programs on your own SSH hosts with Run Remotely.">
          <button onClick={() => setDialog("compute-hosts")}>Configure Remote Hosts…</button>
        </Row>
      </Section>
    </>
  );
}

function ThemeCard({ id, theme, selected }: { id: string; theme: Theme; selected: boolean }) {
  const c = theme.colors;
  const x = theme.syntax;
  return (
    <button
      className={`theme-card${selected ? " selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={() => setPrefs({ theme: id })}
      title={theme.description}
    >
      <span className="theme-preview" style={{ background: c["editor.background"], borderColor: c["border.default"] }} aria-hidden>
        <span className="theme-preview-bar" style={{ background: c["activityBar.background"] }}>
          <span style={{ background: c["accent.primary"] }} />
        </span>
        <code style={{ color: x.identifier }}>
          (<span style={{ color: x.keyword }}>define</span> (<span style={{ color: x.function }}>f</span> x){"\n"}
          {"  "}(<span style={{ color: x.test }}>check-expect</span> <span style={{ color: x.string }}>"ok"</span> <span style={{ color: x.number }}>42</span>))
        </code>
      </span>
      <span className="theme-name">
        {id === "system" ? "Follow System" : theme.name}
        {theme.unofficial && id !== "system" && <span className="setting-hint">Unofficial community theme</span>}
      </span>
    </button>
  );
}

function Appearance() {
  const prefs = useApp((s) => s.prefs);
  const dark = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return (
    <>
      <Section title="Color theme">
        <div className="theme-grid" role="radiogroup" aria-label="Color theme">
          <ThemeCard id="system" theme={resolveThemeChoice("system", dark)} selected={prefs.theme === "system"} />
          {THEMES.map((t) => (
            <ThemeCard key={t.id} id={t.id} theme={t} selected={prefs.theme === t.id} />
          ))}
        </div>
      </Section>
      <Section title="Layout">
        <Row label="Interface scale">
          <input type="number" min={0.75} max={2} step={0.05} value={prefs.uiScale} onChange={(e) => setPrefs({ uiScale: Number(e.target.value) || 1 })} />
        </Row>
        <Check pref="menuBarVisible" label="Show menu bar" />
        <Check pref="explorerVisible" label="Show sidebar" />
        <Check pref="panelVisible" label="Show bottom panel" />
        <Check pref="statusBarVisible" label="Show status bar" />
        <Check pref="reducedMotion" label="Reduce motion" hint="Turns off animations and smooth scrolling." />
      </Section>
    </>
  );
}

function Editor() {
  const prefs = useApp((s) => s.prefs);
  return (
    <>
      <Section title="Font">
        <Row label="Font family">
          <input className="wide" value={prefs.fontFamily} onChange={(e) => setPrefs({ fontFamily: e.target.value })} />
        </Row>
        <Row label="Font size">
          <input type="number" min={8} max={40} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) || 14 })} />
        </Row>
        <Row label="Line height">
          <input type="number" min={1} max={3} step={0.1} value={prefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: Number(e.target.value) || 1.5 })} />
        </Row>
      </Section>
      <Section title="Typing">
        <Check pref="autoClosingBrackets" label="Close brackets automatically" hint="Typing ( [ or { inserts the closing bracket." />
        <Check pref="autoClosingQuotes" label="Close quotes automatically" hint={'Typing " inserts the closing quote.'} />
        <Check pref="suggestions" label="Suggestions while typing" hint="Names your language provides and names defined in your program. Ctrl+Space shows them at any time." />
        <Check pref="liveCheck" label="Check while typing" hint="Racket expands your program in the background (it is not run) and marks errors, unused names and where each name is bound." />
      </Section>
      <Section title="Highlighting">
        <Check pref="highlightOccurrences" label="Highlight the name under the cursor" hint="Its binding and every use of it (from Check while typing)." />
        <Check pref="highlightCurrentLine" label="Highlight the current line" />
        <Check pref="highlightMatchingBrackets" label="Highlight matching brackets" />
        <Check pref="bracketGuides" label="Bracket guides" hint="Lines that show which brackets belong together." />
        <Check pref="fadeUnused" label="Fade unused local names" />
        <Check pref="inlineErrors" label="Show error messages at the end of the line" hint="Besides the underline, the message is written after the line." />
        <Check pref="hovers" label="Show information when hovering a name" hint="Where it comes from, its uses and its documentation." />
        <Check pref="stickyDefinitions" label="Keep the current definition's first line visible" hint="While scrolling through a long definition, its header stays at the top." />
        <Check pref="debugInlineValues" label="Show values next to the code while debugging" />
      </Section>
      <Section title="Outline">
        <Check pref="outlineFollowCursor" label="Follow the cursor" hint="The Outline marks the definition you are editing." />
        <Check pref="outlineShowTests" label="Show tests" hint="check-expect and the other test forms, with their result from the last Run." />
        <Check pref="outlineShowSignatures" label="Show signatures" hint={'HtDP signatures written above a definition, such as ";; sq : Number -> Number".'} />
      </Section>
      <Section title="Display">
        <Check pref="rainbowBrackets" label="Rainbow parentheses" />
        <Check pref="minimap" label="Show minimap" />
      </Section>
    </>
  );
}

const AUTOSAVE: { id: AutosaveMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "afterDelay", label: "After a delay" },
  { id: "onFocusChange", label: "When the editor loses focus" },
  { id: "onWindowChange", label: "When the window loses focus" },
];

/** Which files the Explorer lists. */
function HiddenFiles() {
  const patterns = useApp((s) => s.prefs.hiddenFiles);
  const custom = customPatterns(patterns);
  const [text, setText] = useState(custom.join("\n"));
  useEffect(() => setText(customPatterns(patterns).join("\n")), [patterns]);
  const saveCustom = () => {
    const kept = patterns.filter((p) => !custom.includes(p));
    setPrefs({ hiddenFiles: [...kept, ...parsePatterns(text).filter((p) => !kept.includes(p))] });
  };
  return (
    <Section title="Hidden in the Explorer">
      <p className="setting-hint">
        Hidden files stay on disk and in Quick Open and Search; only the Explorer stops listing them. Its eye button shows them for a moment.
      </p>
      {HIDDEN_PRESETS.map((p) => (
        <label key={p.id} className="setting-check">
          <input type="checkbox" checked={presetEnabled(patterns, p)} onChange={(e) => setPrefs({ hiddenFiles: setPreset(patterns, p, e.target.checked) })} />
          <span>{p.label}</span>
        </label>
      ))}
      <Row label="Other patterns" hint="One per line. *.log hides files by name, drafts/ hides folders, docs/*.pdf is matched from the open folder.">
        <textarea className="setting-patterns" rows={4} spellCheck={false} aria-label="Other hidden file patterns" value={text} placeholder={"*.log\ndrafts/"} onChange={(e) => setText(e.target.value)} onBlur={saveCustom} />
      </Row>
      <Check pref="showHiddenFiles" label="Show hidden files anyway" />
      <div className="row">
        <button onClick={() => setPrefs({ hiddenFiles: [...DEFAULT_HIDDEN] })}>Restore Defaults</button>
      </div>
    </Section>
  );
}

function Files() {
  const prefs = useApp((s) => s.prefs);
  return (
    <>
    <HiddenFiles />
    <Section title="Source control">
      <Check pref="git" label="Use Git for the open folder" hint="The Source Control view, diffs and the branch in the status bar. Git must be installed." />
      <Check pref="gitGutter" label="Show changed lines in the margin" hint="Green: added, blue: changed, red: deleted, since the last commit." />
      <Check pref="gitExplorer" label="Color changed files in the Explorer" />
    </Section>
    <Section title="Saving">
      <Row label="Auto save" hint="Only files that already have a file name are saved automatically.">
        <select value={prefs.autosave} onChange={(e) => setPrefs({ autosave: e.target.value as AutosaveMode })}>
          {AUTOSAVE.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </Row>
      {prefs.autosave === "afterDelay" && (
        <Row label="Delay" hint="Milliseconds after the last change.">
          <input type="number" min={200} max={60000} step={100} value={prefs.autosaveDelay} onChange={(e) => setPrefs({ autosaveDelay: Number(e.target.value) || 1500 })} />
        </Row>
      )}
      <p className="setting-hint">
        A file whose DrRacket language lines were edited is never saved automatically; saving it asks for confirmation.
      </p>
    </Section>
    </>
  );
}

export function SettingsDialog() {
  const page = useApp((s) => s.settingsPage);
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <Modal title="Settings" className="settings-modal" onClose={() => setDialog(null)}>
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings pages">
          {PAGES.map((p) => (
            <button key={p.id} className={p.id === current.id ? "active" : ""} aria-current={p.id === current.id ? "page" : undefined} onClick={() => setSettingsPage(p.id)}>
              <Icon name={p.icon} size={16} />
              {p.title}
            </button>
          ))}
        </nav>
        <div className="settings-page" aria-label={current.title}>
          <h2>{current.title}</h2>
          {current.id === "general" && <General />}
          {current.id === "appearance" && <Appearance />}
          {current.id === "editor" && <Editor />}
          {current.id === "files" && <Files />}
          {current.id === "keyboard" && <KeybindingsEditor />}
        </div>
      </div>
    </Modal>
  );
}
