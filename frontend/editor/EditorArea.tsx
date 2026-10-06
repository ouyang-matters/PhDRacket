// The editor area: editor groups arranged by the layout tree in the store
// (frontend/workbench/layout.ts). Each group has its own Monaco editor; a
// document open in several groups shows the same model in each, so edits
// stay synchronized and nothing is duplicated.

import { useEffect, useRef, useState, type DragEvent } from "react";
import { monaco, setRainbowBrackets } from "./monaco";
import {
  activateTab,
  autosaveOnEditorBlur,
  closeTab,
  editorMayTakeFocus,
  focusGroup,
  getState,
  isDirty,
  isDiffTabId,
  isViewTabId,
  isWebTabId,
  moveTab,
  resizeEditorSplit,
  useApp,
  type Doc,
} from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { stepSourceRange } from "@frontend/stepper/StepperPanel";
import type { LayoutNode, SplitNode } from "@frontend/workbench/layout";
import { activeGroupEditor, registerGroupEditor, setActiveGroupId } from "@frontend/workbench/editors";
import { openContextMenu } from "@frontend/workbench/ContextMenu";
import { Icon, type IconName } from "@frontend/workbench/icons";
import { StartPage } from "@frontend/workbench/StartPage";
import { BrowserView } from "@frontend/browser/BrowserView";
import { DiffView } from "@frontend/git/DiffView";

/** The Definitions editor of the active group, if mounted. */
export function definitionsEditor() {
  return activeGroupEditor();
}

/** Moves the cursor to a range in the active group's editor. */
export function revealRange(range: monaco.IRange) {
  const editor = activeGroupEditor();
  if (!editor) return;
  editor.setSelection(range);
  editor.revealRangeInCenterIfOutsideViewport(range);
  editor.focus();
}

const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const TAB_MIME = "application/x-phdracket-tab";

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
          value: `**DrRacket language metadata** (${doc.language.name}).\n\nPreserved byte-for-byte unless edited.`,
        },
      },
    },
  ];
}

function readTab(e: DragEvent): { groupId: string; docId: string } | null {
  try {
    return JSON.parse(e.dataTransfer.getData(TAB_MIME));
  } catch {
    return null;
  }
}

function Tabs({ groupId }: { groupId: string }) {
  const group = useApp((s) => s.layout.groups[groupId]);
  const docs = useApp((s) => s.docs);
  const webTabs = useApp((s) => s.webTabs);
  const diffTabs = useApp((s) => s.diffTabs);
  const active = useApp((s) => s.layout.activeGroup === groupId);
  useApp((s) => s.revision);
  const [dropAt, setDropAt] = useState<number | null>(null);
  if (!group) return null;

  const onDrop = (e: DragEvent, index: number) => {
    const t = readTab(e);
    setDropAt(null);
    if (!t) return;
    e.preventDefault();
    moveTab(t.groupId, groupId, t.docId, index);
  };

  return (
    <div
      className="tabs"
      role="tablist"
      aria-label="Open files"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TAB_MIME)) {
          e.preventDefault();
          if ((e.target as HTMLElement) === e.currentTarget) setDropAt(group.tabs.length);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}
      onDrop={(e) => onDrop(e, group.tabs.length)}
    >
      {group.tabs.map((id, i) => {
        const selected = id === group.active;
        const diff = isDiffTabId(id) ? diffTabs.find((w) => w.id === id) : null;
        const web = isWebTabId(id) ? webTabs.find((w) => w.id === id) : diff ? { id, title: diff.title, url: "" } : null;
        if (web) {
          return (
            <div
              key={id}
              role="tab"
              aria-selected={selected}
              draggable
              className={`tab web${selected ? " active" : ""}${selected && active ? " focused" : ""}${dropAt === i ? " drop-before" : ""}`}
              title={diff ? `${diff.left.label} ↔ ${diff.right.label}` : web.url || "New browser tab"}
              onClick={() => activateTab(groupId, id)}
              onAuxClick={(e) => e.button === 1 && void closeTab(groupId, id)}
              onContextMenu={(e) => openContextMenu(e, "editor.tabContext", { groupId, docId: id })}
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_MIME, JSON.stringify({ groupId, docId: id }));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TAB_MIME)) return;
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.stopPropagation();
                onDrop(e, dropAt ?? i);
              }}
            >
              <Icon name={diff ? "diff" : "globe"} size={13} />
              <span className="tab-name">{web.title}</span>
              <button
                className="tab-close"
                aria-label={`Close ${web.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void closeTab(groupId, id);
                }}
              >
                ×
              </button>
            </div>
          );
        }
        const d = docs.find((x) => x.id === id);
        if (!d) return null;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={selected}
            draggable
            className={`tab${selected ? " active" : ""}${selected && active ? " focused" : ""}${dropAt === i ? " drop-before" : ""}`}
            title={d.path ?? "Not yet saved"}
            onClick={() => activateTab(groupId, id)}
            onAuxClick={(e) => e.button === 1 && void closeTab(groupId, id)}
            onContextMenu={(e) => openContextMenu(e, "editor.tabContext", { groupId, docId: id })}
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_MIME, JSON.stringify({ groupId, docId: id }));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TAB_MIME)) return;
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.stopPropagation();
              onDrop(e, dropAt ?? i);
            }}
          >
            <span className="tab-name">{d.name}</span>
            <span className="tab-lang">{d.language.short}</span>
            <button
              className={`tab-close${isDirty(d) ? " dirty" : ""}`}
              aria-label={isDirty(d) ? `${d.name} has unsaved changes; close` : `Close ${d.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(groupId, id);
              }}
            >
              {isDirty(d) ? "●" : "×"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ToolButton({ command, icon, label, className }: { command: string; icon: IconName; label?: string; className?: string }) {
  const key = keybindingFor(command);
  return (
    <button
      className={`icon-button${label ? " labeled" : ""}${className ? ` ${className}` : ""}`}
      title={`${label ?? command}${key ? ` (${formatKey(key)})` : ""}`}
      onClick={() => executeCommand(command)}
    >
      <Icon name={icon} />
      {label && <span>{label}</span>}
    </button>
  );
}

/** Contextual actions for the group: Run is the obvious default. */
function GroupToolbar({ groupId }: { groupId: string }) {
  const active = useApp((s) => s.layout.activeGroup === groupId);
  const hasTab = useApp((s) => !!s.layout.groups[groupId]?.active);
  const hasDoc = useApp((s) => !!s.layout.groups[groupId]?.active && !isViewTabId(s.layout.groups[groupId]?.active));
  const running = useApp((s) => s.run.status === "running");
  const many = useApp((s) => Object.keys(s.layout.groups).length > 1);
  return (
    <div className="group-toolbar" onMouseDown={() => focusGroup(groupId)}>
      {active && hasDoc && (
        <>
          {running && <ToolButton command="run.stop" icon="stop" label="Stop" className="stop" />}
          <ToolButton command="run.stepper" icon="stepper" label="Step" />
          <ToolButton command="debug.start" icon="bug" label="Debug" />
          <ToolButton command="run.run" icon="run" label="Run" className="run" />
        </>
      )}
      {hasTab && <ToolButton command="view.splitEditorRight" icon="splitRight" />}
      {many && <ToolButton command="view.closeEditorGroup" icon="close" />}
    </div>
  );
}

function EditorGroupView({ groupId }: { groupId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const stepDecorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const docId = useApp((s) => s.layout.groups[groupId]?.active ?? null);
  const isActive = useApp((s) => s.layout.activeGroup === groupId);
  const doc = useApp((s) => s.docs.find((d) => d.id === docId) ?? null);
  const languageKey = useApp((s) => {
    const d = s.docs.find((x) => x.id === docId);
    return d ? `${d.language.kind}:${d.language.metadataLines}` : "";
  });
  const stepper = useApp((s) => s.stepper);
  const panel = useApp((s) => s.panel);
  const prefs = useApp((s) => s.prefs);
  const [dropping, setDropping] = useState(false);

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
      contextmenu: true,
      ariaLabel: "Definitions",
    });
    editorRef.current = editor;
    decorations.current = editor.createDecorationsCollection();
    stepDecorations.current = editor.createDecorationsCollection();
    const offRegister = registerGroupEditor(groupId, editor);
    const offFocus = editor.onDidFocusEditorText(() => focusGroup(groupId));
    const offBlur = editor.onDidBlurEditorText(() => {
      const d = getState().docs.find((x) => x.model === editor.getModel());
      if (d) autosaveOnEditorBlur(d.id);
    });
    return () => {
      offBlur.dispose();
      const model = editor.getModel();
      const d = getState().docs.find((x) => x.model === model);
      if (d) viewStates.set(`${groupId}:${d.id}`, editor.saveViewState());
      offFocus.dispose();
      offRegister();
      editor.dispose();
      editorRef.current = null;
    };
  }, [groupId]);

  // Show the group's active document (its shared model).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getModel();
    const prev = getState().docs.find((d) => d.model === current);
    if (prev && !prev.model.isDisposed()) viewStates.set(`${groupId}:${prev.id}`, editor.saveViewState());
    if (!doc) {
      editor.setModel(null);
      return;
    }
    if (current !== doc.model) {
      editor.setModel(doc.model);
      const vs = viewStates.get(`${groupId}:${doc.id}`);
      if (vs) editor.restoreViewState(vs);
      if (getState().layout.activeGroup === groupId && editorMayTakeFocus()) editor.focus();
    }
    decorations.current?.set(metadataDecorations(doc));
  }, [doc, groupId, languageKey]);

  useEffect(() => {
    if (isActive) setActiveGroupId(groupId);
  }, [isActive, groupId]);

  // The expression the current Stepper step is about.
  useEffect(() => {
    const step = stepper.steps[stepper.index];
    const target =
      panel === "stepper" && step && step.kind !== "error" && stepper.docId === docId ? stepSourceRange(step.beforeSource) : null;
    stepDecorations.current?.set(target ? [{ range: target.range, options: { className: "phd-step-source" } }] : []);
    if (target) editorRef.current?.revealRangeInCenterIfOutsideViewport(target.range);
  }, [stepper, panel, docId]);

  useEffect(() => {
    setRainbowBrackets(prefs.rainbowBrackets);
    editorRef.current?.updateOptions({
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      lineHeight: Math.round(prefs.fontSize * prefs.lineHeight),
      minimap: { enabled: prefs.minimap },
      bracketPairColorization: { enabled: prefs.rainbowBrackets },
      autoClosingBrackets: prefs.autoClosingBrackets ? "languageDefined" : "never",
      autoClosingQuotes: prefs.autoClosingQuotes ? "languageDefined" : "never",
      // Word completion is lexical: words already in the file, nothing more.
      // Suggestions come from the language and the program (frontend/analysis).
      quickSuggestions: prefs.suggestions ? { other: true, comments: false, strings: false } : false,
      wordBasedSuggestions: "off",
      cursorBlinking: prefs.reducedMotion ? "solid" : "blink",
      occurrencesHighlight: prefs.highlightOccurrences ? "singleFile" : "off",
      selectionHighlight: prefs.highlightOccurrences,
      renderLineHighlight: prefs.highlightCurrentLine ? "line" : "none",
      matchBrackets: prefs.highlightMatchingBrackets ? "always" : "never",
      guides: { bracketPairs: prefs.bracketGuides ? "active" : false, indentation: false },
      hover: { enabled: prefs.hovers ? "on" : "off" },
      stickyScroll: { enabled: prefs.stickyDefinitions },
      smoothScrolling: !prefs.reducedMotion,
    });
  }, [prefs]);

  return (
    <section
      className={`editor-group${isActive ? " active" : ""}`}
      aria-label="Editor group"
      data-key-context="editor"
      onMouseDown={() => focusGroup(groupId)}
    >
      <div className="group-header">
        <Tabs groupId={groupId} />
        <GroupToolbar groupId={groupId} />
      </div>
      <div
        className={`editor-host${dropping ? " drop-target" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(TAB_MIME)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          const t = readTab(e);
          if (t) {
            e.preventDefault();
            moveTab(t.groupId, groupId, t.docId);
          }
        }}
      >
        {/* monaco-component: Monaco defines its theme variables on this class, and
            attaches menus and other overflow widgets to this container, beside
            .monaco-editor; without it the editor's context menu has no colors. */}
        <div className="monaco-host monaco-component" ref={host} />
        {!doc && !isViewTabId(docId) && <div className="group-watermark">{groupWatermark()}</div>}
        {isDiffTabId(docId) && <DiffView key={docId} id={docId!} />}
        {isWebTabId(docId) && <BrowserView key={docId} id={docId!} active />}
      </div>
    </section>
  );
}

function groupWatermark() {
  const rows: [string, string][] = [
    ["Command Palette", "workbench.commandPalette"],
    ["Go to File", "workbench.quickOpen"],
    ["Open File", "file.openFile"],
    ["Split Editor Right", "view.splitEditorRight"],
  ];
  return (
    <dl>
      {rows.map(([label, id]) => {
        const key = keybindingFor(id);
        return key ? (
          <div key={id}>
            <dt>{label}</dt>
            <dd>{formatKey(key)}</dd>
          </div>
        ) : null;
      })}
    </dl>
  );
}

function SplitView({ node }: { node: SplitNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; start: number; sizes: number[]; total: number } | null>(null);
  const row = node.orientation === "row";
  return (
    <div className={`split ${node.orientation}`} ref={ref}>
      {node.children.map((child, i) => (
        <div key={child.type === "group" ? child.groupId : child.id} className="split-pane" style={{ flexGrow: node.sizes[i], flexBasis: 0 }}>
          {i > 0 && (
            <div
              className={`sash ${row ? "vertical" : "horizontal"} split-sash`}
              role="separator"
              aria-orientation={row ? "vertical" : "horizontal"}
              onPointerDown={(e) => {
                const r = ref.current!.getBoundingClientRect();
                drag.current = { index: i, start: row ? e.clientX : e.clientY, sizes: [...node.sizes], total: row ? r.width : r.height };
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const delta = ((row ? e.clientX : e.clientY) - d.start) / d.total;
                const min = 0.1;
                const pair = d.sizes[d.index - 1] + d.sizes[d.index];
                const before = Math.min(Math.max(d.sizes[d.index - 1] + delta, min), pair - min);
                const sizes = [...d.sizes];
                sizes[d.index - 1] = before;
                sizes[d.index] = pair - before;
                resizeEditorSplit(node.id, sizes);
              }}
              onPointerUp={() => (drag.current = null)}
              onDoubleClick={() => resizeEditorSplit(node.id, node.sizes.map(() => 1))}
            />
          )}
          <LayoutView node={child} />
        </div>
      ))}
    </div>
  );
}

function LayoutView({ node }: { node: LayoutNode }) {
  return node.type === "group" ? <EditorGroupView groupId={node.groupId} /> : <SplitView node={node} />;
}

export function EditorArea() {
  const root = useApp((s) => s.layout.root);
  const empty = useApp((s) => s.docs.length === 0 && s.webTabs.length === 0 && s.diffTabs.length === 0 && s.layout.root.type === "group");
  return (
    <section className="editor-area" aria-label="Editors">
      <LayoutView node={root} />
      {empty && <StartPage />}
    </section>
  );
}
