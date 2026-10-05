//! File operations for the Explorer: create, rename, copy, move, delete to
//! the Recycle Bin, properties, and watching the open folder for changes.
//!
//! Every operation takes the open folder (`root`) and refuses paths outside
//! it. Nothing is ever deleted permanently or overwritten: deletes go to the
//! system trash, and a name that already exists is an error (copies get a
//! fresh name instead).

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{RecursiveMode, Watcher};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("{0} is outside the open folder")]
    Outside(String),
    #[error("{0}")]
    BadName(String),
    #[error("\"{0}\" already exists")]
    Exists(String),
    #[error("cannot move a folder into itself")]
    IntoItself,
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("could not move to the Recycle Bin: {0}")]
    Trash(String),
}

pub type Result<T> = std::result::Result<T, FileError>;

/// One entry of a folder, with what the Explorer shows on hover.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    /// Bytes (files only).
    pub size: u64,
    /// Milliseconds since the Unix epoch, if known.
    pub modified: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Properties {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub size: u64,
    pub created: Option<u64>,
    pub modified: Option<u64>,
    pub readonly: bool,
    /// Text files: number of lines, if the file is small enough to read.
    pub lines: Option<u64>,
    /// Text files: the first lines (for the language declaration).
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub files: u64,
    pub folders: u64,
    pub size: u64,
    /// True when the count stopped at the limit.
    pub truncated: bool,
}

fn millis(t: std::io::Result<SystemTime>) -> Option<u64> {
    t.ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64)
}

/// Removes `.` and `..` without touching the disk (for paths that may not exist).
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// The real path of `p`, or of its nearest existing ancestor plus the rest.
fn resolve(p: &Path) -> PathBuf {
    let p = normalize(p);
    let mut existing = p.clone();
    let mut rest = Vec::new();
    while !existing.exists() {
        match (existing.file_name().map(|n| n.to_owned()), existing.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name);
                existing = parent.to_path_buf();
            }
            _ => return p,
        }
    }
    let mut out = fs::canonicalize(&existing).unwrap_or(existing);
    for name in rest.into_iter().rev() {
        out.push(name);
    }
    out
}

/// Checks that `p` is inside `root` (or is `root` when `allow_root`).
fn inside(root: &Path, p: &Path, allow_root: bool) -> Result<PathBuf> {
    let root = resolve(root);
    let target = resolve(p);
    if target.starts_with(&root) && (allow_root || target != root) {
        Ok(p.to_path_buf())
    } else {
        Err(FileError::Outside(p.display().to_string()))
    }
}

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3",
    "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A new file or folder name: one path component, valid on every platform.
pub fn check_name(name: &str) -> Result<&str> {
    let bad = |why: &str| Err(FileError::BadName(why.to_string()));
    if name.trim().is_empty() {
        return bad("A name is required.");
    }
    if name == "." || name == ".." {
        return bad("That name is reserved.");
    }
    if let Some(c) = name.chars().find(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()) {
        return bad(&format!("A name cannot contain {c:?}."));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return bad("A name cannot end with a dot or a space.");
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        return bad("That name is reserved by Windows.");
    }
    if name.len() > 255 {
        return bad("That name is too long.");
    }
    Ok(name)
}

/// Lists every entry of a folder (nothing hidden: the Explorer applies the
/// user's hiding rules), folders first, then by name.
pub fn list(root: &Path, dir: &Path) -> Result<Vec<Entry>> {
    inside(root, dir, true)?;
    let mut entries: Vec<Entry> = fs::read_dir(dir)?
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some(Entry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified: millis(meta.modified()),
            })
        })
        .collect();
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

fn fresh(target: &Path) -> Result<()> {
    if target.exists() {
        return Err(FileError::Exists(target.file_name().unwrap_or_default().to_string_lossy().into_owned()));
    }
    Ok(())
}

pub fn create_file(root: &Path, dir: &Path, name: &str) -> Result<PathBuf> {
    let target = inside(root, &dir.join(check_name(name)?), false)?;
    fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => FileError::Exists(name.to_string()),
        _ => e.into(),
    })?;
    Ok(target)
}

pub fn create_dir(root: &Path, dir: &Path, name: &str) -> Result<PathBuf> {
    let target = inside(root, &dir.join(check_name(name)?), false)?;
    fresh(&target)?;
    fs::create_dir(&target)?;
    Ok(target)
}

/// Renames in place. A change of letter case only is allowed.
pub fn rename(root: &Path, path: &Path, name: &str) -> Result<PathBuf> {
    inside(root, path, false)?;
    let target = path.with_file_name(check_name(name)?);
    inside(root, &target, false)?;
    let same_entry = path.file_name().map(|n| n.to_string_lossy().to_lowercase()) == Some(name.to_lowercase());
    if !same_entry {
        fresh(&target)?;
    }
    fs::rename(path, &target)?;
    Ok(target)
}

/// "name copy.rkt", "name copy 2.rkt", … : the first that does not exist.
fn copy_name(dir: &Path, name: &str, is_dir: bool) -> PathBuf {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 && !is_dir => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    for n in 1.. {
        let candidate = dir.join(if n == 1 { format!("{stem} copy{ext}") } else { format!("{stem} copy {n}{ext}") });
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    if fs::metadata(from)?.is_dir() {
        fs::create_dir(to)?;
        for e in fs::read_dir(from)?.flatten() {
            copy_recursive(&e.path(), &to.join(e.file_name()))?;
        }
    } else {
        fs::copy(from, to)?;
    }
    Ok(())
}

fn check_not_into_itself(src: &Path, dest_dir: &Path) -> Result<()> {
    let (s, d) = (resolve(src), resolve(dest_dir));
    if d.starts_with(&s) {
        return Err(FileError::IntoItself);
    }
    Ok(())
}

/// Copies `src` into `dest_dir`, choosing a fresh name if needed.
pub fn copy_into(root: &Path, src: &Path, dest_dir: &Path) -> Result<PathBuf> {
    inside(root, src, false)?;
    inside(root, dest_dir, true)?;
    check_not_into_itself(src, dest_dir)?;
    let name = src.file_name().ok_or_else(|| FileError::BadName("Nothing to copy.".into()))?.to_string_lossy().into_owned();
    let target = copy_name(dest_dir, &name, src.is_dir());
    copy_recursive(src, &target)?;
    Ok(target)
}

/// Copies `path` beside itself ("name copy.ext").
pub fn duplicate(root: &Path, path: &Path) -> Result<PathBuf> {
    let parent = path.parent().ok_or_else(|| FileError::Outside(path.display().to_string()))?;
    copy_into(root, path, parent)
}

/// Moves `src` into `dest_dir`. A name that exists there is an error.
pub fn move_into(root: &Path, src: &Path, dest_dir: &Path) -> Result<PathBuf> {
    inside(root, src, false)?;
    inside(root, dest_dir, true)?;
    check_not_into_itself(src, dest_dir)?;
    let name = src.file_name().ok_or_else(|| FileError::BadName("Nothing to move.".into()))?;
    let target = dest_dir.join(name);
    if resolve(&target) == resolve(src) {
        return Ok(target);
    }
    fresh(&target)?;
    if fs::rename(src, &target).is_err() {
        // Across volumes: copy, then remove the original only after the copy worked.
        copy_recursive(src, &target)?;
        trash::delete(src).map_err(|e| FileError::Trash(e.to_string()))?;
    }
    Ok(target)
}

/// Moves to the Recycle Bin (Trash). Never deletes permanently.
///
/// PHDRACKET_TEST_TRASH_DIR (end-to-end tests) moves into that folder
/// instead, so tests leave nothing in the user's Recycle Bin.
pub fn trash(root: &Path, path: &Path) -> Result<()> {
    inside(root, path, false)?;
    if let Some(dir) = std::env::var_os("PHDRACKET_TEST_TRASH_DIR") {
        let dir = PathBuf::from(dir);
        fs::create_dir_all(&dir)?;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        fs::rename(path, copy_name(&dir, &name, path.is_dir()))?;
        return Ok(());
    }
    trash::delete(path).map_err(|e| FileError::Trash(e.to_string()))
}

const MAX_READ: u64 = 4 * 1024 * 1024;

pub fn properties(root: &Path, path: &Path) -> Result<Properties> {
    inside(root, path, true)?;
    let meta = fs::metadata(path)?;
    let (mut lines, mut head) = (None, None);
    if meta.is_file() && meta.len() <= MAX_READ {
        if let Ok(text) = fs::read_to_string(path) {
            lines = Some(if text.is_empty() { 0 } else { text.lines().count() as u64 });
            head = Some(text.trim_start_matches('\u{feff}').lines().take(4).collect::<Vec<_>>().join("\n"));
        }
    }
    Ok(Properties {
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string()),
        path: path.to_path_buf(),
        is_dir: meta.is_dir(),
        size: if meta.is_dir() { 0 } else { meta.len() },
        created: millis(meta.created()),
        modified: millis(meta.modified()),
        readonly: meta.permissions().readonly(),
        lines,
        head,
    })
}

/// Counts a folder's contents, stopping after `limit` entries.
pub fn folder_stats(root: &Path, dir: &Path, limit: u64) -> Result<FolderStats> {
    inside(root, dir, true)?;
    let mut s = FolderStats { files: 0, folders: 0, size: 0, truncated: false };
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            if s.files + s.folders >= limit {
                s.truncated = true;
                return Ok(s);
            }
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                s.folders += 1;
                stack.push(e.path());
            } else {
                s.files += 1;
                s.size += e.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    Ok(s)
}

/// Watches a folder tree. `on_change` receives the folders whose listing
/// changed, batched (at most one call every 150 ms). Dropping the watcher
/// stops it.
pub struct FolderWatcher {
    _watcher: notify::RecommendedWatcher,
}

pub fn watch(root: &Path, on_change: impl Fn(Vec<PathBuf>) + Send + 'static) -> Result<FolderWatcher> {
    let (tx, rx) = mpsc::channel::<Vec<PathBuf>>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if matches!(event.kind, notify::EventKind::Access(_)) {
                return;
            }
            let _ = tx.send(event.paths);
        }
    })
    .map_err(|e| FileError::Io(std::io::Error::other(e.to_string())))?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| FileError::Io(std::io::Error::other(e.to_string())))?;
    std::thread::spawn(move || {
        // Ends when the watcher (and with it the sender) is dropped.
        while let Ok(first) = rx.recv() {
            let mut paths = first;
            let until = std::time::Instant::now() + Duration::from_millis(150);
            while let Some(left) = until.checked_duration_since(std::time::Instant::now()) {
                match rx.recv_timeout(left) {
                    Ok(more) => paths.extend(more),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            // A change to an entry changes its folder's listing (and, for
            // size or time, the entry itself, which the folder shows).
            let mut dirs: Vec<PathBuf> = paths.iter().filter_map(|p| p.parent().map(Path::to_path_buf)).collect();
            dirs.sort();
            dirs.dedup();
            on_change(dirs);
        }
    });
    Ok(FolderWatcher { _watcher: watcher })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("phdracket-files-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn names_are_checked() {
        assert!(check_name("a3.rkt").is_ok());
        for bad in ["", " ", "..", "a/b", "a\\b", "x:y", "CON", "nul.txt", "end.", "end "] {
            assert!(check_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn creates_renames_copies_and_moves_inside_the_folder() {
        let root = tmp("ops");
        let f = create_file(&root, &root, "a.rkt").unwrap();
        assert!(matches!(create_file(&root, &root, "a.rkt"), Err(FileError::Exists(_))));
        let d = create_dir(&root, &root, "sub").unwrap();
        let r = rename(&root, &f, "b.rkt").unwrap();
        assert!(r.exists() && !f.exists());
        // Case-only rename.
        let r = rename(&root, &r, "B.rkt").unwrap();
        assert_eq!(r.file_name().unwrap(), "B.rkt");
        let c1 = duplicate(&root, &r).unwrap();
        let c2 = duplicate(&root, &r).unwrap();
        assert_eq!(c1.file_name().unwrap(), "B copy.rkt");
        assert_eq!(c2.file_name().unwrap(), "B copy 2.rkt");
        let m = move_into(&root, &c1, &d).unwrap();
        assert!(m.exists() && !c1.exists());
        assert!(matches!(move_into(&root, &d, &d), Err(FileError::IntoItself)));
        let names: Vec<String> = list(&root, &root).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["sub", "B copy 2.rkt", "B.rkt"]);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        let root = tmp("outside");
        let other = tmp("outside-other");
        let f = other.join("x.rkt");
        fs::write(&f, "x").unwrap();
        assert!(matches!(rename(&root, &f, "y.rkt"), Err(FileError::Outside(_))));
        assert!(matches!(trash(&root, &f), Err(FileError::Outside(_))));
        assert!(matches!(create_file(&root, &root.join(".."), "z.rkt"), Err(FileError::Outside(_))));
        assert!(matches!(trash(&root, &root), Err(FileError::Outside(_))));
        assert!(f.exists());
        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&other).unwrap();
    }

    #[test]
    fn reads_properties_and_folder_stats() {
        let root = tmp("props");
        fs::write(root.join("a.rkt"), "#lang htdp/bsl\n(define x 1)\n").unwrap();
        fs::create_dir(root.join("d")).unwrap();
        fs::write(root.join("d").join("b.txt"), "hello").unwrap();
        let p = properties(&root, &root.join("a.rkt")).unwrap();
        assert_eq!((p.lines, p.size, p.is_dir), (Some(2), 28, false));
        assert!(p.head.unwrap().starts_with("#lang htdp/bsl"));
        let s = folder_stats(&root, &root, 1000).unwrap();
        assert_eq!((s.files, s.folders, s.size, s.truncated), (2, 1, 33, false));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reports_changes_in_the_watched_folder() {
        let root = tmp("watch");
        let (tx, rx) = mpsc::channel();
        let w = watch(&root, move |dirs| {
            let _ = tx.send(dirs);
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(200));
        fs::write(root.join("new.rkt"), "x").unwrap();
        let dirs = rx.recv_timeout(Duration::from_secs(5)).expect("a change event");
        let canon = fs::canonicalize(&root).unwrap();
        assert!(dirs.iter().any(|d| d == &root || fs::canonicalize(d).ok().as_ref() == Some(&canon)), "{dirs:?}");
        drop(w);
        fs::remove_dir_all(&root).unwrap();
    }
}
