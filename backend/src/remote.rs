//! Remote compute: running a program on another machine over SSH.
//!
//! PhDRacket never handles credentials. It runs the system `ssh` client in
//! batch mode, so a host is usable only if the user's own SSH configuration
//! (keys, agent, `~/.ssh/config`) already allows a non-interactive login.
//! Arguments are passed to `ssh` directly, never through a local shell.
//!
//! Local Run is unaffected: it always uses the local Racket bridge.

use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
    #[error("invalid remote host: {0:?}")]
    InvalidHost(String),
    #[error("invalid Racket command: {0:?}")]
    InvalidCommand(String),
    #[error("could not start ssh: {0}")]
    Spawn(std::io::Error),
    #[error("{0}")]
    Failed(String),
}

/// An SSH destination as the user wrote it (`host`, `user@host`, or an alias
/// from `~/.ssh/config`). Options are refused so a destination cannot inject
/// `ssh` flags.
pub fn check_host(host: &str) -> Result<(), RemoteError> {
    let ok = !host.is_empty()
        && host.len() <= 255
        && !host.starts_with('-')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || "@._-:[]".contains(c));
    if ok {
        Ok(())
    } else {
        Err(RemoteError::InvalidHost(host.to_owned()))
    }
}

/// The remote Racket command: a path or name without shell syntax.
pub fn check_racket(cmd: &str) -> Result<(), RemoteError> {
    let ok = !cmd.is_empty() && cmd.len() <= 512 && cmd.chars().all(|c| c.is_ascii_alphanumeric() || "/._-+~".contains(c));
    if ok {
        Ok(())
    } else {
        Err(RemoteError::InvalidCommand(cmd.to_owned()))
    }
}

/// A file name safe to use in the remote command.
pub fn safe_file_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || "._-".contains(c) { c } else { '_' }).collect();
    let cleaned = cleaned.trim_start_matches('.').to_owned();
    if cleaned.is_empty() {
        "program.rkt".to_owned()
    } else {
        cleaned
    }
}

fn ssh(host: &str) -> Command {
    let mut cmd = Command::new("ssh");
    // Unknown host keys are not accepted automatically: the user connects once
    // with ssh to verify and record the key.
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "--", host]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// The remote shell command that stores the program and runs it.
pub fn remote_command(racket: &str, file: &str) -> String {
    let dir = "$HOME/.phdracket-remote";
    format!("mkdir -p {dir} && cat > {dir}/{file} && cd {dir} && {racket} {file}")
}

/// Checks that the host is reachable and reports its Racket version.
pub fn probe(host: &str, racket: &str) -> Result<String, RemoteError> {
    check_host(host)?;
    check_racket(racket)?;
    let out = ssh(host)
        .arg(format!("{racket} --version"))
        .stdin(Stdio::null())
        .output()
        .map_err(RemoteError::Spawn)?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    if out.status.success() && !text.is_empty() {
        Ok(text)
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        Err(RemoteError::Failed(if err.is_empty() { format!("ssh exited with {}", out.status) } else { err }))
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum TaskEvent {
    Output { task: u64, stream: String, text: String },
    Exit { task: u64, code: Option<i32>, cancelled: bool },
}

pub type TaskSink = Arc<dyn Fn(TaskEvent) + Send + Sync>;

/// A running remote task. Dropping it does not stop it; call `cancel`.
pub struct Task {
    child: Arc<Mutex<Option<Child>>>,
    cancelled: Arc<Mutex<bool>>,
}

impl Task {
    pub fn cancel(&self) {
        *self.cancelled.lock().unwrap() = true;
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            // Closing the connection ends the remote command.
            let _ = child.kill();
        }
    }
}

fn pump(task: u64, stream: &'static str, reader: impl Read + Send + 'static, sink: TaskSink) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut line) {
            if n == 0 {
                break;
            }
            sink(TaskEvent::Output { task, stream: stream.to_owned(), text: String::from_utf8_lossy(&line).into_owned() });
            line.clear();
        }
    })
}

/// Sends `program` to the host and runs it with Racket, streaming output.
pub fn run(task: u64, host: &str, racket: &str, file_name: &str, program: &str, sink: TaskSink) -> Result<Task, RemoteError> {
    check_host(host)?;
    check_racket(racket)?;
    let file = safe_file_name(file_name);
    let mut child = ssh(host)
        .arg(remote_command(racket, &file))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(RemoteError::Spawn)?;
    let mut stdin = child.stdin.take().expect("piped stdin");
    let program = program.to_owned();
    std::thread::spawn(move || {
        let _ = stdin.write_all(program.as_bytes());
        // Dropping stdin ends `cat` on the remote side.
    });
    let out = pump(task, "stdout", child.stdout.take().expect("piped stdout"), sink.clone());
    let err = pump(task, "stderr", child.stderr.take().expect("piped stderr"), sink.clone());
    let child = Arc::new(Mutex::new(Some(child)));
    let cancelled = Arc::new(Mutex::new(false));
    let (c, k) = (child.clone(), cancelled.clone());
    std::thread::spawn(move || {
        let _ = out.join();
        let _ = err.join();
        let code = loop {
            let mut guard = c.lock().unwrap();
            match guard.as_mut().map(|ch| ch.try_wait()) {
                Some(Ok(Some(status))) => break status.code(),
                Some(Ok(None)) => {}
                _ => break None,
            }
            drop(guard);
            std::thread::sleep(Duration::from_millis(50));
        };
        c.lock().unwrap().take();
        sink(TaskEvent::Exit { task, code, cancelled: *k.lock().unwrap() });
    });
    Ok(Task { child, cancelled })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_and_commands_cannot_inject() {
        for ok in ["dgx", "user@dgx.example.org", "aouyang@psfa436-f041057-anqiao", "[::1]", "host:22"] {
            assert!(check_host(ok).is_ok(), "{ok}");
        }
        for bad in ["", "-oProxyCommand=x", "a b", "a;rm", "a$(x)", "a`x`", "a\nb", "a|b"] {
            assert!(check_host(bad).is_err(), "{bad:?}");
        }
        for ok in ["racket", "/opt/racket/bin/racket", "~/racket-9.3/bin/racket"] {
            assert!(check_racket(ok).is_ok(), "{ok}");
        }
        for bad in ["", "racket; rm -rf ~", "racket && x", "$(x)", "racket -e"] {
            assert!(check_racket(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn file_names_are_sanitized() {
        assert_eq!(safe_file_name("a3 q2.rkt"), "a3_q2.rkt");
        assert_eq!(safe_file_name("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(safe_file_name("$(x).rkt"), "__x_.rkt");
        assert_eq!(safe_file_name(""), "program.rkt");
        assert_eq!(remote_command("racket", "a.rkt"), "mkdir -p $HOME/.phdracket-remote && cat > $HOME/.phdracket-remote/a.rkt && cd $HOME/.phdracket-remote && racket a.rkt");
    }
}
