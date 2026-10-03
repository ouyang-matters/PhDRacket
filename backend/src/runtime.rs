//! Discovery of installed official Racket distributions.
//!
//! PhDRacket never bundles or modifies a Racket runtime. It looks for
//! installations in conventional locations and on PATH, asks each one for its
//! version, and lets the user choose. Version mismatches with a course profile
//! produce warnings, never refusals.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    /// Path of the `racket` executable.
    pub executable: PathBuf,
    /// `(version)`, e.g. "9.3".
    pub version: String,
    /// `(system-type 'vm)`, e.g. "chez-scheme".
    pub vm: String,
    /// Whether the HtDP teaching languages (htdp-lib) are installed.
    pub has_htdp: bool,
    /// Where the installation was found ("PATH", "standard location", "user").
    pub found_via: String,
}

#[derive(Debug, thiserror::Error)]
pub enum RuntimeError {
    #[error("{0} is not a working Racket executable: {1}")]
    NotRacket(PathBuf, String),
}

#[cfg(windows)]
pub const RACKET_EXE: &str = "racket.exe";
#[cfg(not(windows))]
pub const RACKET_EXE: &str = "racket";

/// Configures a Command so that no console window flashes on Windows.
pub fn hide_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

const PROBE: &str = r#"(write (list (version) (symbol->string (system-type 'vm)) (and (collection-file-path "run-teaching-program.rkt" "lang" #:fail (lambda (e) #f)) #t)))"#;

/// Asks a candidate executable for its version. Uses only `racket/base`.
pub fn probe(executable: &Path, found_via: &str) -> Result<RuntimeInfo, RuntimeError> {
    let fail = |msg: String| RuntimeError::NotRacket(executable.to_owned(), msg);
    let out = hide_console(Command::new(executable).args(["-I", "racket/base", "-e", PROBE]))
        .output()
        .map_err(|e| fail(e.to_string()))?;
    if !out.status.success() {
        return Err(fail(String::from_utf8_lossy(&out.stderr).trim().to_owned()));
    }
    let s = String::from_utf8_lossy(&out.stdout);
    // Expected: ("9.3" "chez-scheme" #t)
    let parts: Vec<&str> = s.trim().trim_start_matches('(').trim_end_matches(')').split(' ').collect();
    match parts.as_slice() {
        [version, vm, htdp] => Ok(RuntimeInfo {
            executable: executable.to_owned(),
            version: version.trim_matches('"').to_owned(),
            vm: vm.trim_matches('"').to_owned(),
            has_htdp: *htdp == "#t",
            found_via: found_via.to_owned(),
        }),
        _ => Err(fail(format!("unexpected probe output: {s}"))),
    }
}

/// Candidate executables, most conventional first. Does not run anything.
pub fn candidates() -> Vec<(PathBuf, &'static str)> {
    let mut out: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push((dir.join(RACKET_EXE), "PATH"));
        }
    }
    for p in standard_locations() {
        out.push((p, "standard location"));
    }
    out
}

#[cfg(windows)]
fn standard_locations() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(v) = std::env::var_os(var) {
            roots.push(PathBuf::from(v));
        }
    }
    if let Some(v) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(v).join("Programs"));
    }
    let mut out = Vec::new();
    for root in roots {
        out.push(root.join("Racket").join("Racket.exe"));
        // Side-by-side installs such as "Racket-9.3" or "Racket v9.3".
        if let Ok(entries) = std::fs::read_dir(&root) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("racket") && name != "racket" {
                    out.push(e.path().join("Racket.exe"));
                }
            }
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn standard_locations() -> Vec<PathBuf> {
    let mut out = vec![
        PathBuf::from("/opt/homebrew/bin/racket"),
        PathBuf::from("/usr/local/bin/racket"),
    ];
    for apps in [PathBuf::from("/Applications"), home().join("Applications")] {
        if let Ok(entries) = std::fs::read_dir(&apps) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy().starts_with("Racket") {
                    out.push(e.path().join("bin").join("racket"));
                }
            }
        }
    }
    out
}

#[cfg(all(unix, not(target_os = "macos")))]
fn standard_locations() -> Vec<PathBuf> {
    let mut out = vec![
        PathBuf::from("/usr/bin/racket"),
        PathBuf::from("/usr/local/bin/racket"),
        PathBuf::from("/usr/racket/bin/racket"),
        PathBuf::from("/snap/bin/racket"),
        home().join("racket").join("bin").join("racket"),
    ];
    // Where PhDRacket installs Racket on Linux.
    if let Ok(entries) = std::fs::read_dir(home().join(".local").join("opt")) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().starts_with("racket") {
                out.push(e.path().join("bin").join("racket"));
            }
        }
    }
    for root in [PathBuf::from("/opt"), PathBuf::from("/usr/local")] {
        if let Ok(entries) = std::fs::read_dir(&root) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy().starts_with("racket") {
                    out.push(e.path().join("bin").join("racket"));
                }
            }
        }
    }
    out
}

#[cfg(unix)]
fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// Finds and probes all installations, de-duplicated by canonical path.
pub fn discover() -> Vec<RuntimeInfo> {
    let mut seen = HashSet::new();
    let mut found = Vec::new();
    let unique: Vec<_> = candidates()
        .into_iter()
        .filter(|(p, _)| p.is_file())
        .filter(|(p, _)| seen.insert(std::fs::canonicalize(p).unwrap_or_else(|_| p.clone())))
        .collect();
    let handles: Vec<_> = unique
        .into_iter()
        .map(|(p, via)| std::thread::spawn(move || probe(&p, via).ok()))
        .collect();
    for h in handles {
        if let Ok(Some(info)) = h.join() {
            found.push(info);
        }
    }
    found
}

/// A warning when the runtime differs from what a course profile expects.
pub fn version_warning(expected: Option<&str>, actual: &RuntimeInfo) -> Option<String> {
    let expected = expected?;
    if expected == actual.version {
        return None;
    }
    Some(format!(
        "The active course profile expects Racket {expected}. Detected Racket {}. \
         Runtime behavior may differ slightly from the course environment.",
        actual.version
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_warning_only_on_mismatch() {
        let rt = RuntimeInfo {
            executable: "racket".into(),
            version: "9.4".into(),
            vm: "chez-scheme".into(),
            has_htdp: true,
            found_via: "PATH".into(),
        };
        assert!(version_warning(Some("9.3"), &rt).unwrap().contains("Detected Racket 9.4"));
        assert!(version_warning(Some("9.4"), &rt).is_none());
        assert!(version_warning(None, &rt).is_none());
    }
}
