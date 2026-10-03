import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { StepData, StepExpression, StepSource } from "@shared/protocol";
import { STEPPER_PROVIDERS } from "@shared/models/profiles";
import { activeProfile, activate, getState, stepActive, useApp, viewStep } from "@frontend/app/store";
import { revealRange } from "@frontend/editor/EditorArea";
import { codePointToUtf16, srclocToRange } from "@frontend/editor/srcloc";

/** Renders one expression with its highlighted ranges. */
function Expression({ exp, tone }: { exp: StepExpression; tone: "before" | "after" }) {
  const parts: ReactNode[] = [];
  let at = 0;
  const ranges = [...exp.highlights].sort((a, b) => a[0] - b[0]);
  ranges.forEach(([s, e], i) => {
    const from = codePointToUtf16(exp.text, s);
    const to = codePointToUtf16(exp.text, e);
    if (from < at) return;
    parts.push(exp.text.slice(at, from));
    parts.push(
      <mark key={i} className={`step-${tone}`}>
        {exp.text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  parts.push(exp.text.slice(at));
  return <pre className={`step-exp${ranges.length === 0 ? " settled" : ""}`}>{parts}</pre>;
}

function Side({ title, exps, tone, error }: { title: string; exps: StepExpression[]; tone: "before" | "after"; error?: string }) {
  const ref = useRef<HTMLElement>(null);
  // Keep the highlighted expression in view; finished definitions come first.
  useEffect(() => {
    ref.current?.querySelector("mark")?.scrollIntoView({ block: "nearest" });
  }, [exps]);
  return (
    <section className={`step-side ${tone}`} aria-label={title} ref={ref}>
      <h3>{title}</h3>
      {exps.map((e, i) => (
        <Expression key={i} exp={e} tone={tone} />
      ))}
      {error && <pre className="step-error">{error}</pre>}
    </section>
  );
}

export function stepSourceRange(source: StepSource | null) {
  const s = getState();
  const doc = s.docs.find((d) => d.id === s.stepper.docId);
  if (!doc || !source?.position) return null;
  const range = srclocToRange(doc.model.getValue(), {
    source: null,
    line: null,
    column: null,
    position: source.position,
    span: source.span,
  });
  return range ? { doc, range } : null;
}

function jumpToSource(step: StepData | undefined) {
  if (!step || step.kind === "error") return;
  const target = stepSourceRange(step.beforeSource);
  if (!target) return;
  activate(target.doc.id);
  requestAnimationFrame(() => revealRange(target.range));
}

export function StepperPanel() {
  const st = useApp((s) => s.stepper);
  const profile = useApp((s) => activeProfile(s));
  const stale = useApp((s) => {
    const doc = s.docs.find((d) => d.id === s.stepper.docId);
    return !!doc && s.stepper.version !== null && doc.model.getAlternativeVersionId() !== s.stepper.version;
  });
  useApp((s) => s.revision);
  const provider = profile.stepperProvider ? STEPPER_PROVIDERS[profile.stepperProvider] : null;
  const total = st.steps.length;
  const step = st.steps[st.index];

  const onKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => viewStep(st.index + 1),
      ArrowDown: () => viewStep(st.index + 1),
      ArrowLeft: () => viewStep(st.index - 1),
      ArrowUp: () => viewStep(st.index - 1),
      Home: () => viewStep(0),
      End: () => viewStep(total - 1),
      Enter: () => jumpToSource(step),
    };
    const f = keys[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  };

  if (!provider) return <div className="panel-empty">Stepper unavailable in this profile.</div>;

  return (
    <div className="stepper" tabIndex={0} onKeyDown={onKey} aria-label={provider.name}>
      <div className="stepper-bar">
        <button onClick={() => void stepActive()} title="Start the Stepper (Ctrl+Shift+Enter)">
          {st.session === null ? "Step" : "Restart"}
        </button>
        <button onClick={() => viewStep(st.index - 1)} disabled={st.index <= 0} title="Previous step (Left arrow)">
          Previous
        </button>
        <button onClick={() => viewStep(st.index + 1)} disabled={st.index >= total - 1} title="Next step (Right arrow)">
          Next
        </button>
        <button onClick={() => viewStep(total - 1)} disabled={total === 0 || st.index >= total - 1} title="Last step (End)">
          Run to End
        </button>
        <span className="stepper-count">
          {total > 0 ? `Step ${st.index + 1} / ${total}${st.status === "running" ? "…" : ""}` : st.status === "running" ? "Stepping…" : ""}
        </span>
        <span className="toolbar-spacer" />
        {stale && <span className="badge" title="Definitions changed since stepping started">Definitions changed</span>}
        <span className="muted small">{provider.name}{st.languageName ? ` · ${st.languageName}` : ""}</span>
      </div>
      {st.session === null ? (
        <div className="panel-empty">Step (Ctrl+Shift+Enter)</div>
      ) : st.error && total === 0 ? (
        <div className="panel-empty">{st.error}</div>
      ) : !step ? (
        <div className="panel-empty">{st.status === "running" ? "Stepping…" : "No steps."}</div>
      ) : step.kind === "error" ? (
        <pre className="step-error">{step.error}</pre>
      ) : (
        <div className="step-view">
          <Side title="Before" exps={step.before} tone="before" />
          {step.kind === "before-after" ? (
            <Side title="After" exps={step.after} tone="after" />
          ) : (
            <Side title="Error" exps={[]} tone="after" error={step.error} />
          )}
        </div>
      )}
      {step && step.kind !== "error" && step.beforeSource && (
        <div className="stepper-foot">
          <button className="link" onClick={() => jumpToSource(step)}>
            Go to source
          </button>
          {st.outcome === "limit" && <span className="muted small">Step limit reached</span>}
        </div>
      )}
    </div>
  );
}
