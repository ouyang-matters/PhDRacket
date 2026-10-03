import { describe, expect, it } from "vitest";
import type { BridgeEvent, StepData } from "@shared/protocol";
import { applyStepperEvent, goToStep, startStepper } from "./stepper-state";

const step = (n: number): StepData => ({
  kind: "before-after",
  before: [{ text: `(+ ${n} 1)`, highlights: [[0, 7]] }],
  after: [{ text: `${n + 1}`, highlights: [[0, 1]] }],
  beforeSource: { position: 10, span: 7 },
  afterSource: null,
});

describe("stepper state", () => {
  it("keeps the full history and clamps navigation", () => {
    const evs: BridgeEvent[] = [
      { ev: "run-started", id: 4, language: { kind: "teaching", name: "Beginning Student" } },
      { ev: "step", id: 4, index: 0, step: step(1) },
      { ev: "step", id: 4, index: 1, step: step(2) },
      { ev: "stepper-finished", id: 4, outcome: "finished", count: 2 },
      { ev: "done", id: 4, ok: true },
    ];
    let s = evs.reduce(applyStepperEvent, startStepper({ session: 2, request: 4, docId: "d", version: 1 }));
    expect(s.steps).toHaveLength(2);
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("finished");
    expect(s.languageName).toBe("Beginning Student");
    s = goToStep(s, 5);
    expect(s.index).toBe(1);
    s = goToStep(s, -3);
    expect(s.index).toBe(0);
  });

  it("records an error reported instead of steps", () => {
    const s = applyStepperEvent(startStepper({ session: 1, request: 1, docId: null, version: null }), {
      ev: "error", id: 1, kind: "language", message: "The Stepper does not support Advanced Student.",
      originalMessage: "", srclocs: [],
    });
    expect(s.error).toMatch(/Advanced Student/);
  });
});
