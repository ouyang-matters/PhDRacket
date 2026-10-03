import { useEffect, useRef } from "react";
import { monaco, setRainbowBrackets } from "./monaco";
import {
  activate,
  closeDoc,
  getState,
  isDirty,
  openPath,
  openWithDialog,
  runActive,
  saveDoc,
  setDialog,
  stepActive,
  useApp,
  type Doc,
} from "@frontend/app/store";
import { monacoThemeFor, resolveTheme } from "@frontend/settings/preferences";
import { stepSourceRange } from "@frontend/stepper/StepperPanel";

const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
let sharedEditor: monaco.editor.IStandaloneCodeEditor | null = null;

/** The Definitions editor, if mounted. */
export function definitionsEditor() {
  return sharedEditor;
}

/** Moves the cursor to a range in the Definitions editor. */
export function revealRange(range: monaco.IRange) {
  if (!sharedEditor) return;
  sharedEditor.setSelection(range);
  sharedEditor.revealRangeInCenterIfOutsideViewport(range);
  sharedEditor.focus();
}

function Tabs() {
  const docs = useApp((s) => s.docs);
  const activeId = useApp((s) => s.activeId);
  useApp((s) => s.revision);
  return (
    <div className="tabs" role="tablist" aria-label="Open files">
      {docs.map((d) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === activeId}
          className={`tab${d.id === activeId ? " active" : ""}`}
          title={d.path ?? "Not yet saved"}
          onClick={() => activate(d.id)}
          onAuxClick={(e) => e.button === 1 && void closeDoc(d)}
        >
          <span className="tab-name">{d.name}</span>
          <span className="tab-lang">{d.language.short}</span>
          <button
            className={`tab-close${isDirty(d) ? " dirty" : ""}`}
            aria-label={isDirty(d) ? `${d.name} has unsaved changes; close` : `Close ${d.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void closeDoc(d);
            }}
          >
            {isDirty(d) ? "●" : "×"}
          </button>
        </div>
      ))}
    </div>
  );
}

function metadataDecorations(doc: Doc): monaco.editor.IModelDeltaDecoration[] {
  const n = doc.language.metadataLines;
  if (n <= 0) return [];
  return [
    {
      range: new monaco.Range(1, 1, n, 1),
      options: {
        isWholeLine: true,
        className: "phd-metadata-line",
        linesDecorationsClassName: "phd-metadata-gutter",
        hoverMessage: {
          value:
            `**DrRacket language metadata** (${doc.language.name}).\n\n` +
            "Preserved byte-for-byte unless edited.",
        },
      },
    },
  ];
}

export function EditorArea() {
  const host = useRef<HTMLDivElement>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const stepDecorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const stepper = useApp((s) => s.stepper);
  const panel = useApp((s) => s.panel);
  const activeId = useApp((s) => s.activeId);
  const prefs = useApp((s) => s.prefs);
  const docs = useApp((s) => s.docs);

  useEffect(() => {
    const editor = monaco.editor.create(host.current!, {
      model: null,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      // Indentation that understands Racket forms is not implemented yet;
      // until it is, Enter keeps the previous line's indentation.
      autoIndent: "keep",
      matchBrackets: "always",
      // Rainbow parentheses are opt-in (Settings); Monaco enables them by default.
      bracketPairColorization: { enabled: getState().prefs.rainbowBrackets },
      guides: { bracketPairs: "active", indentation: false },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: "off",
      parameterHints: { enabled: false },
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      unicodeHighlight: { ambiguousCharacters: true, invisibleCharacters: true },
      ariaLabel: "Definitions",
    });
    sharedEditor = editor;
    decorations.current = editor.createDecorationsCollection();
    stepDecorations.current = editor.createDecorationsCollection();
    const { KeyMod, KeyCode } = monaco;
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => void runActive());
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => void stepActive());
    editor.addCommand(KeyCode.F5, () => void runActive());
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyR, () => void runActive());
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => void saveDoc());
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS, () => void saveDoc(undefined, true));
    return () => {
      sharedEditor = null;
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    const editor = sharedEditor;
    if (!editor) return;
    const current = editor.getModel();
    const prevDoc = getState().docs.find((d) => d.model === current);
    if (prevDoc) viewStates.set(prevDoc.id, editor.saveViewState());
    const doc = docs.find((d) => d.id === activeId) ?? null;
    if (!doc) {
      editor.setModel(null);
      return;
    }
    if (current !== doc.model) {
      editor.setModel(doc.model);
      const vs = viewStates.get(doc.id);
      if (vs) editor.restoreViewState(vs);
      editor.focus();
    }
    decorations.current?.set(metadataDecorations(doc));
  }, [activeId, docs]);

  // The expression the current Stepper step is about.
  useEffect(() => {
    const step = stepper.steps[stepper.index];
    const target =
      panel === "stepper" && step && step.kind !== "error" && stepper.docId === activeId
        ? stepSourceRange(step.beforeSource)
        : null;
    stepDecorations.current?.set(target ? [{ range: target.range, options: { className: "phd-step-source" } }] : []);
    if (target) sharedEditor?.revealRangeInCenterIfOutsideViewport(target.range);
  }, [stepper, panel, activeId]);

  useEffect(() => {
    const resolved = resolveTheme(prefs.theme);
    monaco.editor.setTheme(monacoThemeFor(resolved));
    setRainbowBrackets(prefs.rainbowBrackets);
    sharedEditor?.updateOptions({
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      lineHeight: Math.round(prefs.fontSize * prefs.lineHeight),
      minimap: { enabled: prefs.minimap },
      bracketPairColorization: { enabled: prefs.rainbowBrackets },
      autoClosingBrackets: prefs.autoClosingBrackets ? "languageDefined" : "never",
      autoClosingQuotes: prefs.autoClosingBrackets ? "languageDefined" : "never",
      cursorBlinking: prefs.reducedMotion ? "solid" : "blink",
      smoothScrolling: !prefs.reducedMotion,
    });
  }, [prefs]);

  return (
    <section className="editor-area" aria-label="Definitions">
      <Tabs />
      <div className="editor-host" ref={host} />
      {docs.length === 0 && <EmptyState />}
    </section>
  );
}

function EmptyState() {
  const recent = useApp((s) => s.recentFiles);
  return (
    <div className="empty-state">
      <h1>PhDRacket</h1>
      <p className="tagline">Same Racket. Better IDE.</p>
      <div className="empty-actions">
        <button className="primary" onClick={() => void openWithDialog()}>
          Open file…
        </button>
        <button onClick={() => setDialog("new-file")}>
          New file…
        </button>
      </div>
      {recent.length > 0 && (
        <div className="recent">
          <h2>Recent</h2>
          <ul>
            {recent.slice(0, 8).map((p) => (
              <li key={p}>
                <button
                  className="link"
                  title={p}
                  onClick={() => void openPath(p)}
                >
                  {p.split(/[\\/]/).pop()}
                  <span className="muted"> {p}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
