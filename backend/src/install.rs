//! Installing the official Racket distribution for the user.
//!
//! PhDRacket never bundles or modifies Racket. When no installation is found,
//! it can download the official installer from download.racket-lang.org,
//! verify it against the SHA-256 checksum published on the release page
//! (pinned below), and run it unattended into a per-user folder.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::runtime::{self, hide_console, RuntimeInfo};

/// The Racket version PhDRacket installs by default.
pub const DEFAULT_VERSION: &str = "9.3";

const BASE_URL: &str = "https://download.racket-lang.org/installers";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallerKind {
    /// Windows NSIS installer.
    Exe,
    /// macOS disk image.
    Dmg,
    /// Linux self-extracting shell script.
    Sh,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerInfo {
    pub version: String,
    pub file: String,
    pub url: String,
    pub sha256: String,
    pub size_mb: f64,
    pub kind: InstallerKind,
}

/// Official installers of the full Racket distribution, with the SHA-256
/// checksums published at https://download.racket-lang.org/releases/9.3/.
/// (version, os, arch, file, sha256, size in MB)
const INSTALLERS: &[(&str, &str, &str, &str, &str, f64)] = &[
    ("9.3", "windows", "x86_64", "racket-9.3-x86_64-win32-cs.exe", "5bea9560f8bc6c9d31d55b52a2f83fb5947e57cf625e1865e6091a428c13fe60", 185.5),
    ("9.3", "windows", "aarch64", "racket-9.3-arm64-win32-cs.exe", "15cd4ace652427465c7c576bad4aede2b8519cb6b59b190c9a22862cf57e7924", 176.3),
    ("9.3", "macos", "aarch64", "racket-9.3-aarch64-macosx-cs.dmg", "21f4937ca0bf37c31e60c1d77f5fd20f175e3ad51f6197f27149055bc222e559", 284.9),
    ("9.3", "macos", "x86_64", "racket-9.3-x86_64-macosx-cs.dmg", "07a35b94f8118be6728db0bce355576373deddb265e75f0295524e297e14f839", 297.9),
    ("9.3", "linux", "x86_64", "racket-9.3-x86_64-linux-buster-cs.sh", "30dc59d9b5af083eacf793253d35782c5231e8bfb7a7331fe32ccd9a41fd792f", 260.1),
    ("9.3", "linux", "aarch64", "racket-9.3-aarch64-linux-buster-cs.sh", "26e4d1c3bf8954c4413fb6737af5d211d44c1e158e34e4c90e0af1cde6353c9a", 252.1),
];

/// The official installer for this computer, if PhDRacket knows one.
pub fn installer_for(version: &str) -> Option<InstallerInfo> {
    installer_for_platform(version, std::env::consts::OS, std::env::consts::ARCH)
}

pub fn installer_for_platform(version: &str, os: &str, arch: &str) -> Option<InstallerInfo> {
    INSTALLERS
        .iter()
        .find(|(v, o, a, ..)| *v == version && *o == os && *a == arch)
        .map(|(v, _, _, file, sha, size)| InstallerInfo {
            version: v.to_string(),
            file: file.to_string(),
            url: format!("{BASE_URL}/{v}/{file}"),
            sha256: sha.to_string(),
            size_mb: *size,
            kind: if file.ends_with(".exe") {
                InstallerKind::Exe
            } else if file.ends_with(".dmg") {
                InstallerKind::Dmg
            } else {
                InstallerKind::Sh
            },
        })
}

/// The default installation folder.
///
/// - Windows: Racket's standard `%ProgramFiles%\Racket`, or `Racket-9.3` next
///   to it when that folder is taken. The official Windows installer
///   requires administrator rights, so Windows asks for confirmation once.
/// - macOS: `~/Applications/Racket v9.3` (no administrator rights).
/// - Linux: `~/.local/opt/racket-9.3` (no administrator rights).
pub fn default_install_dir(version: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    match std::env::consts::OS {
        "windows" => std::env::var_os("ProgramFiles").map(|d| {
            let standard = PathBuf::from(&d).join("Racket");
            if standard.exists() {
                PathBuf::from(d).join(format!("Racket-{version}"))
            } else {
                standard
            }
        }),
        "macos" => home.map(|h| h.join("Applications").join(format!("Racket v{version}"))),
        _ => home.map(|h| h.join(".local").join("opt").join(format!("racket-{version}"))),
    }
}

/// Where the racket executable will be inside an installation folder.
pub fn racket_executable_in(dir: &Path) -> PathBuf {
    if cfg!(windows) {
        dir.join("Racket.exe")
    } else {
        dir.join("bin").join("racket")
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "phase", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum InstallProgress {
    Downloading { received: u64, total: Option<u64> },
    Verifying,
    Installing,
    Checking,
}

#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    #[error("PhDRacket cannot install Racket {0} on this system automatically.")]
    Unsupported(String),
    #[error("Download failed: {0}")]
    Download(String),
    #[error("The downloaded installer does not match the official checksum. It was deleted.")]
    Checksum,
    #[error("The Racket installer failed: {0}")]
    Installer(String),
    #[error("Racket was installed but could not be started: {0}")]
    Probe(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

/// Downloads `info.url` into `dir`, verifying its SHA-256 while streaming.
pub fn download(info: &InstallerInfo, dir: &Path, progress: &dyn Fn(InstallProgress)) -> Result<PathBuf, InstallError> {
    fs::create_dir_all(dir)?;
    let path = dir.join(&info.file);
    let partial = dir.join(format!("{}.part", info.file));
    let response = ureq::get(&info.url).call().map_err(|e| InstallError::Download(e.to_string()))?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_body().into_reader();
    let mut out = fs::File::create(&partial)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut received: u64 = 0;
    let mut last_report = 0u64;
    loop {
        let n = reader.read(&mut buf).map_err(|e| InstallError::Download(e.to_string()))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        hasher.update(&buf[..n]);
        received += n as u64;
        if received - last_report >= 1 << 20 {
            last_report = received;
            progress(InstallProgress::Downloading { received, total });
        }
    }
    out.sync_all()?;
    drop(out);
    progress(InstallProgress::Verifying);
    let digest: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if digest != info.sha256 {
        let _ = fs::remove_file(&partial);
        return Err(InstallError::Checksum);
    }
    fs::rename(&partial, &path)?;
    Ok(path)
}

/// Runs a verified installer unattended, installing into `dest`.
pub fn run_installer(kind: InstallerKind, installer: &Path, dest: &Path) -> Result<(), InstallError> {
    let fail = |what: &str, out: std::process::Output| {
        InstallError::Installer(format!(
            "{what} exited with {}: {}{}",
            out.status,
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        ))
    };
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    match kind {
        InstallerKind::Sh => {
            // The official script installs in place without questions when
            // given --in-place and --dest.
            let out = Command::new("sh").arg(installer).arg("--in-place").arg("--dest").arg(dest).output()?;
            if !out.status.success() {
                return Err(fail("installer", out));
            }
        }
        InstallerKind::Exe => {
            // The official installer requires administrator rights, so it is
            // started through Windows' elevation prompt. NSIS options: /S runs
            // silently; /D= sets the folder and must come last, unquoted.
            let script = format!(
                "$p = Start-Process -FilePath '{}' -ArgumentList '/S','/D={}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
                installer.display().to_string().replace('\'', "''"),
                dest.display().to_string().replace('\'', "''"),
            );
            let mut cmd = Command::new("powershell");
            cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
            let out = hide_console(&mut cmd).output()?;
            if !out.status.success() {
                let text = String::from_utf8_lossy(&out.stderr);
                if text.contains("canceled") || text.contains("cancelled") {
                    return Err(InstallError::Installer("the administrator prompt was declined".into()));
                }
                return Err(fail("installer", out));
            }
        }
        InstallerKind::Dmg => {
            let mount = std::env::temp_dir().join(format!("phdracket-racket-{}", std::process::id()));
            fs::create_dir_all(&mount)?;
            let out = Command::new("hdiutil")
                .args(["attach", "-nobrowse", "-readonly", "-mountpoint"])
                .arg(&mount)
                .arg(installer)
                .output()?;
            if !out.status.success() {
                return Err(fail("hdiutil attach", out));
            }
            let result = (|| {
                // The disk image contains one folder named like "Racket v9.3".
                let folder = fs::read_dir(&mount)?
                    .flatten()
                    .map(|e| e.path())
                    .find(|p| p.is_dir() && p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("Racket")))
                    .ok_or_else(|| InstallError::Installer("the disk image has no Racket folder".into()))?;
                let out = Command::new("ditto").arg(&folder).arg(dest).output()?;
                if !out.status.success() {
                    return Err(fail("ditto", out));
                }
                Ok(())
            })();
            let _ = Command::new("hdiutil").arg("detach").arg(&mount).arg("-quiet").output();
            let _ = fs::remove_dir(&mount);
            result?;
        }
    }
    Ok(())
}

/// Downloads, verifies and installs Racket `version` into `dest`, then
/// checks the installation. Returns the new runtime.
pub fn install(
    version: &str,
    dest: &Path,
    download_dir: &Path,
    progress: &dyn Fn(InstallProgress),
) -> Result<RuntimeInfo, InstallError> {
    let info = installer_for(version).ok_or_else(|| InstallError::Unsupported(version.to_owned()))?;
    let exe = racket_executable_in(dest);
    if !exe.is_file() {
        let installer = download(&info, download_dir, progress)?;
        progress(InstallProgress::Installing);
        let result = run_installer(info.kind, &installer, dest);
        let _ = fs::remove_file(&installer);
        result?;
    }
    progress(InstallProgress::Checking);
    let rt = runtime::probe(&exe, "installed by PhDRacket").map_err(|e| InstallError::Probe(e.to_string()))?;
    if !rt.has_htdp {
        return Err(InstallError::Probe("the installation does not include the teaching languages".into()));
    }
    Ok(rt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_supported_platform_has_an_installer() {
        for (os, arch) in [
            ("windows", "x86_64"),
            ("windows", "aarch64"),
            ("macos", "aarch64"),
            ("macos", "x86_64"),
            ("linux", "x86_64"),
            ("linux", "aarch64"),
        ] {
            let i = installer_for_platform(DEFAULT_VERSION, os, arch).unwrap();
            assert_eq!(i.sha256.len(), 64);
            assert!(i.url.starts_with("https://download.racket-lang.org/installers/9.3/"));
        }
        assert!(installer_for_platform("9.3", "linux", "riscv64").is_none());
    }
}
