//! Typed messages between the backend and the Racket bridge, and between the
//! backend and the UI. Mirrored in shared/protocol/index.ts.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A Racket source location. `line` is 1-based, `column` 0-based, both
/// counted in characters (code points), as reported by Racket.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Srcloc {
    pub source: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub position: Option<u32>,
    pub span: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLanguage {
    /// "teaching", "module", or "unrecognized-metadata".
    pub kind: String,
    pub id: Option<String>,
    pub name: Option<String>,
    pub module: Option<String>,
    pub lang: Option<String>,
}

/// Events emitted by backend/racket/phdracket-bridge.rkt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "ev", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum BridgeEvent {
    Ready { protocol: u32, racket_version: String, vm: String, htdp: bool },
    RunStarted { id: Value, language: RunLanguage },
    /// A printed result (definitions or interactions), rendered by the
    /// language's own printer.
    Value { id: Value, text: String },
    Stdout { text: String },
    Stderr { text: String },
    Error {
        id: Value,
        /// "read", "syntax", "runtime", "language", "bridge", "break", "raise".
        kind: String,
        /// The message DrRacket would display (htdp-rewritten where applicable).
        message: String,
        /// `exn-message` exactly as raised.
        original_message: String,
        srclocs: Vec<Srcloc>,
    },
    Tests {
        id: Value,
        total: u32,
        failed: u32,
        signature_violations: u32,
        failures: Vec<Option<Srcloc>>,
        /// The test engine's own textual report.
        report: String,
    },
    Done { id: Value, ok: bool },
    /// One step from the official HtDP stepper, already rendered to text.
    Step { id: Value, index: u32, step: Value },
    StepperFinished { id: Value, outcome: String, count: u32 },
    /// Background analysis of the edited program (private/analysis.rkt).
    CheckResult { id: Value, result: Value },
    /// Debugging: the breakpoint lines that have code to stop at.
    Breakpoints { id: Value, lines: Vec<u32> },
    /// Debugging: the program paused before an expression ("before") or after
    /// it produced a value ("after"). Positions are 0-based character offsets.
    Paused {
        id: Value,
        kind: String,
        position: u32,
        span: u32,
        line: u32,
        value: Option<String>,
        frames: Value,
    },
    Resumed { id: Value },
    ProtocolError { message: String },
}

/// Commands sent to the bridge.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "op", rename_all = "kebab-case")]
pub enum BridgeCommand {
    Run { id: u64, path: Option<String>, source: String },
    Eval { id: u64, text: String },
    Step { id: u64, path: Option<String>, source: String },
    /// A Run with breakpoints (1-based lines).
    Debug { id: u64, path: Option<String>, source: String, breakpoints: Vec<u32> },
    /// "continue", "step-into", "step-over", "step-out", "pause" or "breakpoints".
    DebugControl { action: String, lines: Vec<u32> },
    Check { id: u64, path: Option<String>, source: String, exports: bool },
    Shutdown,
}

/// Events delivered to the UI. `session` identifies one Run; events from a
/// session that has been replaced must be ignored.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum EngineEvent {
    Bridge { session: u64, event: BridgeEvent },
    /// The session's process ended (Stop, a new Run, `exit`, or a crash).
    SessionEnded { session: u64, reason: String, stderr: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bridge_events() {
        let e: BridgeEvent = serde_json::from_str(
            r#"{"ev":"error","id":1,"kind":"syntax","message":"m","originalMessage":"o",
                "srclocs":[{"source":"a.rkt","line":5,"column":0,"position":10,"span":3}]}"#,
        )
        .unwrap();
        assert!(matches!(e, BridgeEvent::Error { ref kind, .. } if kind == "syntax"));
        let e: BridgeEvent = serde_json::from_str(
            r#"{"ev":"tests","id":1,"total":2,"failed":1,"signatureViolations":0,
                "failures":[null],"report":"r"}"#,
        )
        .unwrap();
        assert!(matches!(e, BridgeEvent::Tests { failed: 1, .. }));
        let e: BridgeEvent = serde_json::from_str(
            r#"{"ev":"ready","protocol":1,"racketVersion":"9.3","vm":"chez-scheme","htdp":true}"#,
        )
        .unwrap();
        assert!(matches!(e, BridgeEvent::Ready { protocol: 1, .. }));
    }

    #[test]
    fn parses_debug_and_check_events() {
        let e: BridgeEvent = serde_json::from_str(
            r#"{"ev":"paused","id":1,"kind":"before","position":32,"span":7,"line":3,"value":null,
                "frames":[{"label":"","position":32,"span":7,"line":3,"bindings":[{"name":"x","value":"3"}]}]}"#,
        )
        .unwrap();
        assert!(matches!(e, BridgeEvent::Paused { line: 3, .. }));
        let e: BridgeEvent = serde_json::from_str(r#"{"ev":"check-result","id":4,"result":{"diagnostics":[]}}"#).unwrap();
        assert!(matches!(e, BridgeEvent::CheckResult { .. }));
        let c = BridgeCommand::DebugControl { action: "step-over".into(), lines: vec![] };
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"op":"debug-control","action":"step-over","lines":[]}"#);
    }

    #[test]
    fn serializes_commands() {
        let c = BridgeCommand::Eval { id: 3, text: "(+ 1 2)".into() };
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"op":"eval","id":3,"text":"(+ 1 2)"}"#);
    }
}
