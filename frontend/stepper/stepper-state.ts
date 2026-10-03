// Stepper state: the complete history of steps reported by the official
// HtDP stepper, and which step is being viewed. Moving backward is instant
// because every step is kept.

import type { BridgeEvent, StepData } from "@shared/protocol";

export type StepperStatus = "idle" | "running" | "done" | "ended";

export interface StepperState {
  session: number | null;
  request: number | null;
  status: StepperStatus;
  steps: StepData[];
  /** Index of the step being viewed. */
  index: number;
  outcome: "finished" | "error" | "limit" | null;
  /** Error reported instead of steps (e.g. unsupported language, syntax error). */
  error: string | null;
  docId: string | null;
  /** Editor version of the Definitions when stepping started. */
  version: number | null;
  languageName: string | null;
}

export const initialStepperState: StepperState = {
  session: null,
  request: null,
  status: "idle",
  steps: [],
  index: 0,
  outcome: null,
  error: null,
  docId: null,
  version: null,
  languageName: null,
};

export function startStepper(
  args: { session: number; request: number; docId: string | null; version: number | null },
): StepperState {
  return { ...initialStepperState, ...args, status: "running" };
}

export function applyStepperEvent(s: StepperState, ev: BridgeEvent): StepperState {
  switch (ev.ev) {
    case "run-started":
      return { ...s, languageName: ev.language.name ?? ev.language.lang ?? null };
    case "step": {
      const steps = [...s.steps];
      steps[ev.index] = ev.step;
      return { ...s, steps };
    }
    case "stepper-finished":
      return { ...s, outcome: ev.outcome };
    case "error":
      return { ...s, error: s.error ?? ev.message };
    case "done":
      return ev.id === s.request ? { ...s, status: "done" } : s;
    default:
      return s;
  }
}

export function endStepper(s: StepperState): StepperState {
  return s.status === "done" ? s : { ...s, status: "ended" };
}

export function goToStep(s: StepperState, index: number): StepperState {
  if (s.steps.length === 0) return s;
  return { ...s, index: Math.min(Math.max(index, 0), s.steps.length - 1) };
}
