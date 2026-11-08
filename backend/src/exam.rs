//! Exam Mode answer files: plain files in one folder (by default
//! "PhDRacket Exam" in the user's Documents folder) where a student writes
//! answers or code during an exam. Any extension is allowed. A new file never
//! replaces an existing one.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::files::{check_name, FileError};

/// The folder's name inside the default location.
pub const DEFAULT_FOLDER_NAME: &str = "PhDRacket Exam";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerFile {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    /// Milliseconds since the Unix epoch.
    pub modified: Option<u64>,
}

/// Creates `dir` if needed and in it a new file holding `text`, named
/// `<stem>.<ext>`, or `<stem>-2.<ext>`, `<stem>-3.<ext>`... when that name is
/// taken. `ext` may be empty (no extension).
pub fn create(dir: &Path, stem: &str, ext: &str, text: &str) -> Result<PathBuf, FileError> {
    let ext = ext.trim_start_matches('.');
    let name_for = |n: u32| {
        let base = if n == 1 { stem.to_string() } else { format!("{stem}-{n}") };
        if ext.is_empty() { base } else { format!("{base}.{ext}") }
    };
    check_name(&name_for(1))?;
    fs::create_dir_all(dir)?;
    for n in 1..=999 {
        let path = dir.join(name_for(n));
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut f) => {
                f.write_all(text.as_bytes())?;
                f.sync_all()?;
                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(FileError::Exists(name_for(1)))
}

/// The files in `dir` (no folders, no hidden files), newest first. A folder
/// that does not exist yet has no files.
pub fn list(dir: &Path) -> Result<Vec<AnswerFile>, FileError> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut files: Vec<AnswerFile> = entries
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().into_owned();
            if !meta.is_file() || name.starts_with('.') {
                return None;
            }
            let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64);
            Some(AnswerFile { name, path: e.path(), size: meta.len(), modified })
        })
        .collect();
    files.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("phdracket-exam-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn creates_the_folder_and_never_overwrites() {
        let dir = temp("create");
        let a = create(&dir, "answers", "txt", "first").unwrap();
        let b = create(&dir, "answers", ".txt", "second").unwrap();
        let c = create(&dir, "notes", "", "").unwrap();
        assert_eq!(a.file_name().unwrap(), "answers.txt");
        assert_eq!(b.file_name().unwrap(), "answers-2.txt");
        assert_eq!(c.file_name().unwrap(), "notes");
        assert_eq!(fs::read_to_string(&a).unwrap(), "first");
        assert_eq!(fs::read_to_string(&b).unwrap(), "second");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_names_that_leave_the_folder() {
        let dir = temp("names");
        assert!(create(&dir, "../escape", "txt", "").is_err());
        assert!(create(&dir, "a", "t/x", "").is_err());
        assert!(!dir.exists());
    }

    #[test]
    fn lists_files_only() {
        let dir = temp("list");
        assert!(list(&dir).unwrap().is_empty());
        create(&dir, "q1", "rkt", "").unwrap();
        create(&dir, "q2", "md", "").unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join(".hidden"), "").unwrap();
        let mut names: Vec<_> = list(&dir).unwrap().into_iter().map(|f| f.name).collect();
        names.sort();
        assert_eq!(names, ["q1.rkt", "q2.md"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
