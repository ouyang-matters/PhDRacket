//! Installation of the Racket bridge program.
//!
//! The bridge sources are embedded in the binary and written to a per-user
//! cache directory, then compiled with the selected installation's own
//! `raco make`. Only the bridge's two files are compiled; every dependency
//! is loaded from the installation's existing compiled files.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::runtime::{hide_console, RuntimeInfo};
use crate::source::sha256_hex;

pub const BRIDGE_MAIN: &str = "phdracket-bridge.rkt";

pub const BRIDGE_FILES: &[(&str, &str)] = &[
    (BRIDGE_MAIN, include_str!("../racket/phdracket-bridge.rkt")),
    ("private/metadata.rkt", include_str!("../racket/private/metadata.rkt")),
    ("private/stepper-adapter.rkt", include_str!("../racket/private/stepper-adapter.rkt")),
];

const COMPILED_MARKER: &str = ".compiled-ok";

#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("could not write the bridge to {0}: {1}")]
    Io(PathBuf, std::io::Error),
    #[error("could not compile the bridge with {racket}:\n{output}")]
    Compile { racket: PathBuf, output: String },
}

/// The directory for this exact bridge version and Racket installation.
pub fn bridge_dir(cache_dir: &Path, runtime: &RuntimeInfo) -> PathBuf {
    let mut key = Vec::new();
    for (name, contents) in BRIDGE_FILES {
        key.extend_from_slice(name.as_bytes());
        key.extend_from_slice(contents.as_bytes());
    }
    key.extend_from_slice(runtime.executable.to_string_lossy().as_bytes());
    key.extend_from_slice(runtime.version.as_bytes());
    key.extend_from_slice(runtime.vm.as_bytes());
    cache_dir.join("bridge").join(&sha256_hex(&key)[..16])
}

/// Ensures the bridge is written and compiled; returns the main file's path.
pub fn install(cache_dir: &Path, runtime: &RuntimeInfo) -> Result<PathBuf, BridgeError> {
    let dir = bridge_dir(cache_dir, runtime);
    let main = dir.join(BRIDGE_MAIN);
    if dir.join(COMPILED_MARKER).is_file() {
        return Ok(main);
    }
    for (name, contents) in BRIDGE_FILES {
        let p = dir.join(name);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| BridgeError::Io(parent.to_owned(), e))?;
        }
        fs::write(&p, contents).map_err(|e| BridgeError::Io(p.clone(), e))?;
    }
    let out = hide_console(
        Command::new(&runtime.executable)
            .args(["-l-", "raco", "make", "-v", BRIDGE_MAIN])
            .current_dir(&dir),
    )
    .output()
    .map_err(|e| BridgeError::Io(dir.clone(), e))?;
    if !out.status.success() {
        return Err(BridgeError::Compile {
            racket: runtime.executable.clone(),
            output: format!(
                "{}{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            ),
        });
    }
    let marker = dir.join(COMPILED_MARKER);
    fs::write(&marker, &runtime.version).map_err(|e| BridgeError::Io(marker, e))?;
    Ok(main)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every Racket source under backend/racket must be embedded.
    #[test]
    fn all_bridge_sources_are_embedded() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("racket");
        let mut found = Vec::new();
        let mut dirs = vec![root.clone()];
        while let Some(d) = dirs.pop() {
            for e in fs::read_dir(&d).unwrap().flatten() {
                let p = e.path();
                if p.is_dir() {
                    if p.file_name().is_some_and(|n| n != "compiled") {
                        dirs.push(p);
                    }
                } else if p.extension().is_some_and(|x| x == "rkt") {
                    let rel = p.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/");
                    found.push(rel);
                }
            }
        }
        found.sort();
        let mut embedded: Vec<String> = BRIDGE_FILES.iter().map(|(n, _)| n.to_string()).collect();
        embedded.sort();
        assert_eq!(found, embedded);
    }
}
