//! End-to-end tests of the Run / Interactions model against the installed
//! official Racket. Skipped (with a message) when no Racket is found, unless
//! PHDRACKET_REQUIRE_RACKET is set.

use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use phdracket_core::engine::{Engine, RunHandle};
use phdracket_core::protocol::{BridgeEvent, EngineEvent};
use phdracket_core::{bridge, runtime};

struct Harness {
    engine: Engine,
    rx: mpsc::Receiver<EngineEvent>,
}

fn harness() -> Option<Harness> {
    let rt = runtime::discover().into_iter().find(|r| r.has_htdp);
    let Some(rt) = rt else {
        assert!(std::env::var_os("PHDRACKET_REQUIRE_RACKET").is_none(), "no Racket with htdp found");
        eprintln!("skipping: no Racket installation with htdp-lib found");
        return None;
    };
    let cache = std::env::temp_dir().join("phdracket-test-cache");
    let main = bridge::install(&cache, &rt).expect("bridge installs");
    let (tx, rx) = mpsc::channel();
    let tx = std::sync::Mutex::new(tx);
    let engine = Engine::new(rt, main, Arc::new(move |e| {
        let _ = tx.lock().unwrap().send(e);
    }));
    Some(Harness { engine, rx })
}

impl Harness {
    /// Collects bridge events of `h.session` until its request is done.
    fn until_done(&self, h: RunHandle) -> Vec<BridgeEvent> {
        let mut out = Vec::new();
        loop {
            let ev = self.rx.recv_timeout(Duration::from_secs(60)).expect("event");
            if let EngineEvent::Bridge { session, event } = ev {
                if session != h.session {
                    continue;
                }
                let done = matches!(&event, BridgeEvent::Done { id, .. } if id.as_u64() == Some(h.request));
                out.push(event);
                if done {
                    return out;
                }
            }
        }
    }
}

fn values(evs: &[BridgeEvent]) -> Vec<String> {
    evs.iter()
        .filter_map(|e| match e {
            BridgeEvent::Value { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

fn errors(evs: &[BridgeEvent]) -> Vec<String> {
    evs.iter()
        .filter_map(|e| match e {
            BridgeEvent::Error { message, .. } => Some(message.clone()),
            _ => None,
        })
        .collect()
}

const BSL_HEADER: &str = ";; The first three lines of this file were inserted by DrRacket. They record metadata\n;; about the language level of this file in a form that our tools can easily process.\n#reader(lib \"htdp-beginner-reader.ss\" \"lang\")((modname e) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))\n";

/// Test E: Run discards the previous interaction state.
#[test]
fn test_e_run_resets_interactions() {
    let Some(h) = harness() else { return };
    let v1 = format!("{BSL_HEADER}(define x 1)\nx\n");
    let r1 = h.engine.run(None, &v1).unwrap();
    assert_eq!(values(&h.until_done(r1)), vec!["1"]);

    let e = h.engine.eval("(define y 10)").unwrap();
    assert!(errors(&h.until_done(e)).is_empty());
    let e = h.engine.eval("(+ x y)").unwrap();
    assert_eq!(values(&h.until_done(e)), vec!["11"]);

    let v2 = format!("{BSL_HEADER}(define x 2)\nx\n");
    let r2 = h.engine.run(None, &v2).unwrap();
    assert_ne!(r1.session, r2.session);
    assert_eq!(values(&h.until_done(r2)), vec!["2"]);

    // `y` was created in the old Interactions and must be gone.
    let e = h.engine.eval("y").unwrap();
    let evs = h.until_done(e);
    assert!(values(&evs).is_empty());
    assert_eq!(errors(&evs), vec!["y: this variable is not defined"]);
}

#[test]
fn stop_ends_a_nonterminating_program() {
    let Some(h) = harness() else { return };
    let src = format!("{BSL_HEADER}(define (loop n) (loop n))\n(loop 1)\n");
    let r = h.engine.run(None, &src).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    assert!(h.engine.stop());
    loop {
        match h.rx.recv_timeout(Duration::from_secs(30)).expect("session end") {
            EngineEvent::SessionEnded { session, reason, .. } if session == r.session => {
                assert_eq!(reason, "stopped");
                break;
            }
            _ => {}
        }
    }
    assert!(h.engine.eval("1").is_err(), "no interactions after Stop");
}

#[test]
fn stepper_runs_independently_of_interactions() {
    let Some(h) = harness() else { return };
    let src = format!("{BSL_HEADER}(define (f x) (* x 2))\n(f 3)\n");
    let r = h.engine.run(None, &src).unwrap();
    assert_eq!(values(&h.until_done(r)), vec!["6"]);
    let s = h.engine.step(None, &src).unwrap();
    let evs = h.until_done(s);
    let steps = evs.iter().filter(|e| matches!(e, BridgeEvent::Step { .. })).count();
    assert!(steps >= 2, "official stepper produced {steps} steps");
    // Interactions are unaffected by stepping.
    let e = h.engine.eval("(f 5)").unwrap();
    assert_eq!(values(&h.until_done(e)), vec!["10"]);
}
