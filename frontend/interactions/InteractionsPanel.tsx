import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { monaco } from "@frontend/editor/monaco";
import { RACKET_LANGUAGE_ID } from "@frontend/editor/racket-language";
import { isCompleteEntry } from "@frontend/editor/sexp";
import { clearInteractions, evalInteraction, getState, runActive, useApp } from "@frontend/app/store";
import { DiagnosticView } from "@frontend/problems/DiagnosticView";
import type { Entry } from "@frontend/run/session";

const HISTORY_LIMIT = 500;

function TranscriptEntry({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case "input":
      return (
        <div className="tx tx-input">
          <span className="prompt" aria-hidden>
            &gt;
          </span>
          <pre>{entry.text}</pre>
        </div>
      );
    case "value":
      return <pre className="tx tx-value">{entry.text}</pre>;
    case "stdout":
      return <pre className="tx tx-stdout">{entry.text}</pre>;
    case "stderr":
      return <pre className="tx tx-stderr">{entry.text}</pre>;
    case "tests":
      return <pre className="tx tx-tests">{entry.text}</pre>;
    case "info":
      return <div className="tx tx-info">{entry.text}</div>;
    case "error":
      return entry.diagnostic ? (
        <DiagnosticView diagnostic={entry.diagnostic} compact />
      ) : (
        <pre className="tx tx-stderr">{entry.text}</pre>
      );
  }
}

function RunBanner() {
  const run = useApp((s) => s.run);
  const runtime = useApp((s) => s.runtime.runtime);
  const stale = useApp((s) => {
    const doc = s.docs.find((d) => d.id === s.run.docId);
    return !!doc && s.run.runVersion !== null && doc.model.getAlternativeVersionId() !== s.run.runVersion;
  });
  useApp((s) => s.revision);
  if (run.session === null) {
    return <div className="run-banner muted">Run (Ctrl+Enter)</div>;
  }
  const lang = run.language?.name ?? run.language?.lang ?? "…";
  return (
    <>
      <div className="run-banner">
        <span>
          Language: <strong>{lang}</strong>
        </span>
        <span className="muted">Racket {run.racketVersion ?? runtime?.version ?? "?"}</span>
        {run.status === "running" && <span className="running-dot">running…</span>}
      </div>
      {stale && run.status !== "ended" && (
        <div className="banner subtle" role="status">
          Definitions changed
          <button onClick={() => void runActive()}>Run</button>
        </div>
      )}
    </>
  );
}

export function InteractionsPanel() {
  const transcript = useApp((s) => s.run.transcript);
  const status = useApp((s) => s.run.status);
  const prefs = useApp((s) => s.prefs);
  const scroller = useRef<HTMLDivElement>(null);
  const inputHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const history = useRef<string[]>([]);
  const historyPos = useRef<number>(-1);
  const [filter, setFilter] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    const model = monaco.editor.createModel("", RACKET_LANGUAGE_ID, monaco.Uri.parse("phdracket:/interactions"));
    const editor = monaco.editor.create(inputHost.current!, {
      model,
      minimap: { enabled: false },
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 4,
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      renderLineHighlight: "none",
      quickSuggestions: false,
      wordBasedSuggestions: "off",
      autoIndent: "keep",
      matchBrackets: "always",
      bracketPairColorization: { enabled: getState().prefs.rainbowBrackets },
      automaticLayout: true,
      scrollbar: { vertical: "auto", horizontal: "hidden", alwaysConsumeMouseWheel: false },
      ariaLabel: "Interactions input",
      wordWrap: "on",
    });
    editorRef.current = editor;

    const resize = () => {
      const lines = Math.min(Math.max(model.getLineCount(), 1), 8);
      const lh = editor.getOption(monaco.editor.EditorOption.lineHeight);
      inputHost.current!.style.height = `${lines * lh + 6}px`;
      editor.layout();
    };
    model.onDidChangeContent(resize);
    resize();

    const submit = async () => {
      const text = model.getValue();
      if (!text.trim()) return;
      if (await evalInteraction(text)) {
        const h = history.current;
        if (h[h.length - 1] !== text) h.push(text);
        if (h.length > HISTORY_LIMIT) h.shift();
        historyPos.current = -1;
        model.setValue("");
      }
    };

    const { KeyCode, KeyMod } = monaco;
    editor.onKeyDown((e) => {
      const pos = editor.getPosition();
      if (!pos) return;
      if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        // Like DrRacket: Enter at the end of a complete expression submits it.
        const atEnd = pos.lineNumber === model.getLineCount() && pos.column === model.getLineMaxColumn(pos.lineNumber);
        if (atEnd && isCompleteEntry(model.getValue())) {
          e.preventDefault();
          e.stopPropagation();
          void submit();
        }
      } else if (e.keyCode === KeyCode.UpArrow && pos.lineNumber === 1 && !e.shiftKey) {
        const h = history.current;
        if (h.length === 0) return;
        e.preventDefault();
        historyPos.current = historyPos.current === -1 ? h.length - 1 : Math.max(0, historyPos.current - 1);
        model.setValue(h[historyPos.current]);
        editor.setPosition({ lineNumber: 1, column: model.getLineMaxColumn(1) });
      } else if (e.keyCode === KeyCode.DownArrow && pos.lineNumber === model.getLineCount() && !e.shiftKey) {
        const h = history.current;
        if (historyPos.current === -1) return;
        e.preventDefault();
        historyPos.current += 1;
        if (historyPos.current >= h.length) {
          historyPos.current = -1;
          model.setValue("");
        } else {
          model.setValue(h[historyPos.current]);
        }
        const last = model.getLineCount();
        editor.setPosition({ lineNumber: last, column: model.getLineMaxColumn(last) });
      }
    });
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => void submit());
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyL, () => clearInteractions());
    editor.addCommand(KeyCode.F5, () => void runActive());
    return () => {
      editor.dispose();
      model.dispose();
    };
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      lineHeight: Math.round(prefs.fontSize * prefs.lineHeight),
      autoClosingBrackets: prefs.autoClosingBrackets ? "languageDefined" : "never",
      autoClosingQuotes: prefs.autoClosingQuotes ? "languageDefined" : "never",
      bracketPairColorization: { enabled: prefs.rainbowBrackets },
    });
  }, [prefs]);

  const disabled = status === "idle" || status === "ended";
  const matches = history.current.filter((h) => h.toLowerCase().includes(filter.toLowerCase())).slice(-50).reverse();

  return (
    <div className="interactions" data-key-context="interactions" style={{ fontFamily: prefs.fontFamily, fontSize: prefs.fontSize }}>
      <RunBanner />
      <div className="transcript" ref={scroller} role="log" aria-live="polite" aria-label="Interactions transcript">
        {transcript.map((e) => (
          <TranscriptEntry key={e.id} entry={e} />
        ))}
      </div>
      {showHistory && (
        <div className="history-search">
          <input
            autoFocus
            placeholder="Search history"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setShowHistory(false)}
            aria-label="Search interaction history"
          />
          <ul>
            {matches.map((h, i) => (
              <li key={i}>
                <button
                  className="link mono"
                  onClick={() => {
                    editorRef.current?.getModel()?.setValue(h);
                    editorRef.current?.focus();
                    setShowHistory(false);
                  }}
                >
                  {h}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`repl-input${disabled ? " disabled" : ""}`}>
        <span className="prompt" aria-hidden>
          &gt;
        </span>
        {/* monaco-component: gives Monaco's context menu its theme colors. */}
        <div className="repl-editor monaco-component" ref={inputHost} />
        <div className="repl-actions">
          <button title="Search history" onClick={() => setShowHistory((v) => !v)}>
            History
          </button>
          <button title="Clear transcript (Ctrl+L)" onClick={clearInteractions}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export function focusInteractions() {
  const host = document.querySelector<HTMLElement>(".repl-editor textarea");
  host?.focus();
  return getState().run.session !== null;
}
