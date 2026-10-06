//! The Run / Interactions model.
//!
//! Each Run gets a brand-new bridge process: pressing Run terminates the
//! previous process, so no interaction state can survive into the new run.
//! To keep Run fast, one spare process is started ahead of time and has the
//! teaching-language libraries loaded but runs nothing until it is used.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::protocol::{BridgeCommand, BridgeEvent, EngineEvent};
use crate::runtime::{hide_console, RuntimeInfo};

pub type Sink = Arc<dyn Fn(EngineEvent) + Send + Sync>;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("could not start Racket ({0}): {1}")]
    Spawn(PathBuf, std::io::Error),
    #[error("nothing is running; press Run first")]
    NotRunning,
    #[error("the Racket process is no longer accepting input: {0}")]
    Pipe(std::io::Error),
}

struct Process {
    session: u64,
    child: Child,
    stdin: ChildStdin,
    end_reason: Arc<Mutex<Option<String>>>,
}

impl Process {
    fn send(&mut self, cmd: &BridgeCommand) -> Result<(), EngineError> {
        let mut line = serde_json::to_vec(cmd).expect("commands serialize");
        line.push(b'\n');
        self.stdin.write_all(&line).and_then(|_| self.stdin.flush()).map_err(EngineError::Pipe)
    }

    fn terminate(mut self, reason: &str) {
        *self.end_reason.lock().unwrap() = Some(reason.to_owned());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn has_exited(&mut self) -> bool {
        !matches!(self.child.try_wait(), Ok(None))
    }
}

#[derive(Default)]
struct State {
    active: Option<Process>,
    spare: Option<Process>,
    /// The Stepper runs in its own process, independent of Interactions.
    stepper: Option<Process>,
    /// The background analysis process (check while typing); long-lived.
    analysis: Option<Process>,
    analysis_checks: u32,
}

/// Analysis processes are replaced after this many checks, so memory used by
/// expanding many versions of a program is returned.
const ANALYSIS_CHECKS_PER_PROCESS: u32 = 200;

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunHandle {
    pub session: u64,
    pub request: u64,
}

pub struct Engine {
    runtime: RuntimeInfo,
    bridge: PathBuf,
    sink: Sink,
    state: Mutex<State>,
    next_session: AtomicU64,
    next_request: AtomicU64,
}

impl Engine {
    pub fn new(runtime: RuntimeInfo, bridge: PathBuf, sink: Sink) -> Self {
        Engine {
            runtime,
            bridge,
            sink,
            state: Mutex::new(State::default()),
            next_session: AtomicU64::new(1),
            next_request: AtomicU64::new(1),
        }
    }

    pub fn runtime(&self) -> &RuntimeInfo {
        &self.runtime
    }

    fn spawn(&self) -> Result<Process, EngineError> {
        let session = self.next_session.fetch_add(1, Ordering::SeqCst);
        let mut cmd = Command::new(&self.runtime.executable);
        cmd.arg(&self.bridge)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = self.bridge.parent() {
            cmd.current_dir(dir);
        }
        let mut child = hide_console(&mut cmd)
            .spawn()
            .map_err(|e| EngineError::Spawn(self.runtime.executable.clone(), e))?;
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let mut stderr = child.stderr.take().expect("piped stderr");
        let end_reason = Arc::new(Mutex::new(None::<String>));

        let stderr_buf = Arc::new(Mutex::new(String::new()));
        let stderr_thread = {
            let buf = stderr_buf.clone();
            std::thread::spawn(move || {
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s);
                buf.lock().unwrap().push_str(&s);
            })
        };

        let sink = self.sink.clone();
        let reason = end_reason.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.split(b'\n') {
                let Ok(line) = line else { break };
                if line.iter().all(u8::is_ascii_whitespace) {
                    continue;
                }
                let event = match serde_json::from_slice::<BridgeEvent>(&line) {
                    Ok(ev) => ev,
                    Err(e) => BridgeEvent::ProtocolError {
                        message: format!("{e}: {}", String::from_utf8_lossy(&line)),
                    },
                };
                sink(EngineEvent::Bridge { session, event });
            }
            let _ = stderr_thread.join();
            let reason = reason.lock().unwrap().clone().unwrap_or_else(|| "exited".to_owned());
            let stderr = stderr_buf.lock().unwrap().clone();
            sink(EngineEvent::SessionEnded { session, reason, stderr });
        });

        Ok(Process { session, child, stdin, end_reason })
    }

    /// The spare process if it is still alive, otherwise a new one.
    fn take_spare(&self, st: &mut State) -> Result<Process, EngineError> {
        match st.spare.take() {
            Some(mut p) => {
                if p.has_exited() {
                    self.spawn()
                } else {
                    Ok(p)
                }
            }
            None => self.spawn(),
        }
    }

    /// Starts a spare process if there is none.
    pub fn prewarm(&self) {
        let mut st = self.state.lock().unwrap();
        if st.spare.as_mut().is_some_and(|p| p.has_exited()) {
            st.spare = None;
        }
        if st.spare.is_none() {
            st.spare = self.spawn().ok();
        }
    }

    /// Run: discard the previous interaction environment and evaluate
    /// `source` (the current Definitions) in a fresh process.
    pub fn run(&self, path: Option<&Path>, source: &str) -> Result<RunHandle, EngineError> {
        let mut st = self.state.lock().unwrap();
        if let Some(old) = st.active.take() {
            old.terminate("replaced by a new Run");
        }
        let mut proc = self.take_spare(&mut st)?;
        let request = self.next_request.fetch_add(1, Ordering::SeqCst);
        proc.send(&BridgeCommand::Run {
            id: request,
            path: path.map(|p| p.to_string_lossy().into_owned()),
            source: source.to_owned(),
        })?;
        let handle = RunHandle { session: proc.session, request };
        st.active = Some(proc);
        st.spare = self.spawn().ok();
        Ok(handle)
    }

    /// Starts the official HtDP stepper on `source` in a fresh process,
    /// replacing any previous stepping session.
    pub fn step(&self, path: Option<&Path>, source: &str) -> Result<RunHandle, EngineError> {
        let mut st = self.state.lock().unwrap();
        if let Some(old) = st.stepper.take() {
            old.terminate("replaced by a new Stepper session");
        }
        let mut proc = self.take_spare(&mut st)?;
        let request = self.next_request.fetch_add(1, Ordering::SeqCst);
        proc.send(&BridgeCommand::Step {
            id: request,
            path: path.map(|p| p.to_string_lossy().into_owned()),
            source: source.to_owned(),
        })?;
        let handle = RunHandle { session: proc.session, request };
        st.stepper = Some(proc);
        st.spare = self.spawn().ok();
        Ok(handle)
    }

    /// Ends the Stepper session, if any.
    /// Runs the program under the debugger (a Run with breakpoints).
    pub fn debug(&self, path: Option<&Path>, source: &str, breakpoints: &[u32]) -> Result<RunHandle, EngineError> {
        let mut st = self.state.lock().unwrap();
        if let Some(old) = st.active.take() {
            old.terminate("replaced by a new Run");
        }
        let mut proc = self.take_spare(&mut st)?;
        let request = self.next_request.fetch_add(1, Ordering::SeqCst);
        proc.send(&BridgeCommand::Debug {
            id: request,
            path: path.map(|p| p.to_string_lossy().into_owned()),
            source: source.to_owned(),
            breakpoints: breakpoints.to_vec(),
        })?;
        let handle = RunHandle { session: proc.session, request };
        st.active = Some(proc);
        st.spare = self.spawn().ok();
        Ok(handle)
    }

    /// Continue, step or pause the program being debugged, or change its breakpoints.
    pub fn debug_control(&self, action: &str, lines: &[u32]) -> Result<(), EngineError> {
        let mut st = self.state.lock().unwrap();
        let proc = st.active.as_mut().ok_or(EngineError::NotRunning)?;
        proc.send(&BridgeCommand::DebugControl { action: action.to_owned(), lines: lines.to_vec() })
    }

    /// Checks a program in the background analysis process. The result
    /// arrives as a `check-result` event of the returned session.
    pub fn check(&self, path: Option<&Path>, source: &str, exports: bool) -> Result<RunHandle, EngineError> {
        let mut st = self.state.lock().unwrap();
        let worn_out = st.analysis_checks >= ANALYSIS_CHECKS_PER_PROCESS;
        if worn_out || st.analysis.as_mut().is_none_or(|p| p.has_exited()) {
            if let Some(old) = st.analysis.take() {
                old.terminate("replaced");
            }
            st.analysis = Some(self.spawn()?);
            st.analysis_checks = 0;
        }
        st.analysis_checks += 1;
        let request = self.next_request.fetch_add(1, Ordering::SeqCst);
        let proc = st.analysis.as_mut().expect("analysis process");
        let sent = proc.send(&BridgeCommand::Check {
            id: request,
            path: path.map(|p| p.to_string_lossy().into_owned()),
            source: source.to_owned(),
            exports,
        });
        let session = proc.session;
        if let Err(e) = sent {
            st.analysis = None;
            return Err(e);
        }
        Ok(RunHandle { session, request })
    }

    pub fn stop_stepper(&self) -> bool {
        match self.state.lock().unwrap().stepper.take() {
            Some(p) => {
                p.terminate("stopped");
                true
            }
            None => false,
        }
    }

    /// Evaluates `text` in the current Interactions environment.
    pub fn eval(&self, text: &str) -> Result<RunHandle, EngineError> {
        let mut st = self.state.lock().unwrap();
        let proc = st.active.as_mut().ok_or(EngineError::NotRunning)?;
        let request = self.next_request.fetch_add(1, Ordering::SeqCst);
        proc.send(&BridgeCommand::Eval { id: request, text: text.to_owned() })?;
        Ok(RunHandle { session: proc.session, request })
    }

    /// Stops the running program (and its Interactions).
    pub fn stop(&self) -> bool {
        let mut st = self.state.lock().unwrap();
        match st.active.take() {
            Some(p) => {
                p.terminate("stopped");
                true
            }
            None => false,
        }
    }

    pub fn active_session(&self) -> Option<u64> {
        self.state.lock().unwrap().active.as_ref().map(|p| p.session)
    }

    pub fn shutdown(&self) {
        let mut st = self.state.lock().unwrap();
        for p in [st.active.take(), st.spare.take(), st.stepper.take(), st.analysis.take()].into_iter().flatten() {
            p.terminate("shutdown");
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.shutdown();
    }
}
