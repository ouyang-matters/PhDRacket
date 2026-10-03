// Typed IPC protocol between the UI and the PhDRacket backend.
// Mirrors backend/src/{protocol,source,language,runtime,engine,settings}.rs.
// The UI renders these values; it never derives program meaning from them.

/** A Racket source location: `line` 1-based, `column` 0-based, `position`
 * 1-based; all counted in characters (Unicode code points). */
export interface Srcloc {
  source: string | null;
  line: number | null;
  column: number | null;
  position: number | null;
  span: number | null;
}

export interface RunLanguage {
  kind: "teaching" | "module" | "unrecognized-metadata" | string;
  id?: string | null;
  name?: string | null;
  module?: string | null;
  lang?: string | null;
}

export type RequestId = number | null;

export type BridgeEvent =
  | { ev: "ready"; protocol: number; racketVersion: string; vm: string; htdp: boolean }
  | { ev: "run-started"; id: RequestId; language: RunLanguage }
  | { ev: "value"; id: RequestId; text: string }
  | { ev: "stdout"; text: string }
  | { ev: "stderr"; text: string }
  | {
      ev: "error";
      id: RequestId;
      kind: "read" | "syntax" | "runtime" | "language" | "bridge" | "break" | "raise" | string;
      message: string;
      originalMessage: string;
      srclocs: Srcloc[];
    }
  | {
      ev: "tests";
      id: RequestId;
      total: number;
      failed: number;
      signatureViolations: number;
      failures: (Srcloc | null)[];
      report: string;
    }
  | { ev: "done"; id: RequestId; ok: boolean }
  | { ev: "step"; id: RequestId; index: number; step: StepData }
  | { ev: "stepper-finished"; id: RequestId; outcome: "finished" | "error" | "limit"; count: number }
  | { ev: "protocol-error"; message: string };

/** One expression as rendered by the stepper. `highlights` are [start, end)
 * character (code point) offsets into `text`. */
export interface StepExpression {
  text: string;
  highlights: [number, number][];
}

export interface StepSource {
  position: number | null;
  span: number | null;
}

export type StepData =
  | {
      kind: "before-after";
      before: StepExpression[];
      after: StepExpression[];
      beforeSource: StepSource | null;
      afterSource: StepSource | null;
    }
  | { kind: "before-error"; before: StepExpression[]; error: string; beforeSource: StepSource | null }
  | { kind: "error"; error: string };

export type EngineEvent =
  | { type: "bridge"; session: number; event: BridgeEvent }
  | { type: "session-ended"; session: number; reason: string; stderr: string };

export interface RunHandle {
  session: number;
  request: number;
}

export type LanguageKind = "teaching" | "module" | "unrecognized-metadata" | "unspecified";

export interface LanguageSummary {
  kind: LanguageKind;
  id: string | null;
  name: string;
  short: string;
  langLine: string | null;
  metadataLines: number;
}

export type LineEnding = "lf" | "crlf" | "mixed" | "none";

export interface OpenedSource {
  path: string;
  text: string;
  lineEnding: LineEnding;
  hasBom: boolean;
  sha256: string;
  language: LanguageSummary;
}

export interface SaveOutcome {
  path: string;
  bytesWritten: number;
  sha256: string;
  identicalToOriginal: boolean;
  lineEndingsNormalized: boolean;
}

export interface RuntimeInfo {
  executable: string;
  version: string;
  vm: string;
  hasHtdp: boolean;
  foundVia: string;
}

export interface RuntimeStatus {
  state: "detecting" | "ready" | "missing" | "error";
  runtime: RuntimeInfo | null;
  message: string | null;
}

export interface InstallerInfo {
  version: string;
  file: string;
  url: string;
  sha256: string;
  sizeMb: number;
  kind: "exe" | "dmg" | "sh";
}

export interface InstallPlan {
  version: string;
  installer: InstallerInfo | null;
  defaultDir: string | null;
  needsAdmin: boolean;
}

export type InstallProgress =
  | { phase: "downloading"; received: number; total: number | null }
  | { phase: "verifying" }
  | { phase: "installing" }
  | { phase: "checking" };

export type InstallEvent =
  | { phase: "progress"; progress: InstallProgress }
  | { phase: "done"; executable: string }
  | { phase: "failed"; message: string };

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface Settings {
  racketExecutable: string | null;
  recentFiles: string[];
  workspaceFolder: string | null;
  ui: unknown;
}

export interface AppInfo {
  name: string;
  version: string;
  os: string;
}
