import { describe, expect, it } from "vitest";
import type { BridgeEvent } from "@shared/protocol";
import { addInput, applyBridgeEvent, classifyError, endSession, initialRunState, startRun, trackRequest } from "./session";

const run = () => startRun(initialRunState, { session: 7, request: 1, docId: "d", path: "/a.rkt", runVersion: 3 });
const apply = (s = run(), ...evs: BridgeEvent[]) => evs.reduce(applyBridgeEvent, s);

describe("run session", () => {
  it("records values, merges output chunks and completes", () => {
    const s = apply(
      run(),
      { ev: "run-started", id: 1, language: { kind: "teaching", id: "beginner", name: "Beginning Student" } },
      { ev: "value", id: 1, text: "2" },
      { ev: "stdout", text: "a" },
      { ev: "stdout", text: "b\n" },
      { ev: "done", id: 1, ok: true },
    );
    expect(s.transcript.map((e) => [e.kind, e.text])).toEqual([
      ["value", "2"],
      ["stdout", "ab\n"],
    ]);
    expect(s.status).toBe("ready");
    expect(s.definitionsOk).toBe(true);
  });

  it("keeps Racket's message and original message verbatim", () => {
    const s = apply(run(), {
      ev: "error",
      id: 1,
      kind: "runtime",
      message: "node-left: expects a node, given 5",
      originalMessage: "node-left: contract violation\n  expected: node?\n  given: 5",
      srclocs: [],
    });
    expect(s.diagnostics[0]).toMatchObject({
      category: "racket",
      message: "node-left: expects a node, given 5",
      originalMessage: "node-left: contract violation\n  expected: node?\n  given: 5",
      origin: "definitions",
    });
  });

  it("labels errors only by the reported exception kind", () => {
    expect(classifyError("syntax", { kind: "teaching", name: "Beginning Student" }).label).toBe(
      "Syntax Error · Beginning Student",
    );
    expect(classifyError("read", null).category).toBe("syntax");
    expect(classifyError("runtime", null).category).toBe("racket");
  });

  it("replaces test diagnostics on each report and attributes interactions", () => {
    let s = apply(run(), {
      ev: "tests", id: 1, total: 2, failed: 1, signatureViolations: 0,
      failures: [{ source: "/a.rkt", line: 5, column: 0, position: 40, span: 10 }], report: "1 of 2 failed",
    }, { ev: "done", id: 1, ok: true });
    expect(s.diagnostics.filter((d) => d.category === "test")).toHaveLength(1);
    s = trackRequest(addInput(s, "(check-expect 1 2)"), 2);
    s = apply(s, {
      ev: "tests", id: 2, total: 3, failed: 2, signatureViolations: 0,
      failures: [null, null], report: "2 of 3 failed",
    });
    expect(s.diagnostics.filter((d) => d.category === "test")).toHaveLength(2);
    expect(s.tests?.origin).toBe("interactions");
    expect(s.status).toBe("running");
  });

  it("handles a reply that arrives before the request id is known", () => {
    let s = apply(run(), { ev: "done", id: 1, ok: true });
    s = addInput(s, "(f 1)");
    expect(s.status).toBe("running");
    s = apply(s, { ev: "value", id: 5, text: "3" }, { ev: "done", id: 5, ok: true });
    expect(s.transcript.map((e) => e.kind)).toEqual(["input", "value"]);
    s = trackRequest(s, 5);
    expect(s.status).toBe("ready");
    expect(s.pending).toEqual([]);
    expect(s.answered).toEqual([]);
  });

  it("ends sessions with an explanation", () => {
    const s = endSession(apply(run(), { ev: "done", id: 1, ok: true }), "stopped", "");
    expect(s.status).toBe("ended");
    expect(s.transcript.at(-1)?.kind).toBe("info");
  });
});
