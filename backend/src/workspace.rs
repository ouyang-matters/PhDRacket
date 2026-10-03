//! Folder browsing for the Explorer. Read-only: listing a folder never
//! creates or changes anything in it.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
}

/// Folder names that are build output or tool state, not course material.
const SKIPPED_DIRS: &[&str] = &["compiled", "node_modules", "target"];

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") || name.eq_ignore_ascii_case("Thumbs.db")
}

/// Lists one folder: subfolders first, then files, each sorted by name
/// (case-insensitive). Hidden entries and build folders are omitted.
pub fn list_dir(path: &Path) -> std::io::Result<Vec<DirEntry>> {
    let mut entries: Vec<DirEntry> = fs::read_dir(path)?
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().ok()?.is_dir();
            if is_hidden(&name) || (is_dir && SKIPPED_DIRS.contains(&name.as_str())) {
                return None;
            }
            Some(DirEntry { name, path: e.path(), is_dir })
        })
        .collect();
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_folders_first_and_skips_noise() {
        let dir = std::env::temp_dir().join(format!("phdracket-ws-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for d in ["A2", "compiled", ".git"] {
            fs::create_dir_all(dir.join(d)).unwrap();
        }
        for f in ["b.rkt", "A1.rkt", ".hidden", "notes.txt"] {
            fs::write(dir.join(f), "").unwrap();
        }
        let names: Vec<String> = list_dir(&dir).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["A2", "A1.rkt", "b.rkt", "notes.txt"]);
        // Listing changes nothing.
        assert!(!dir.join(".phdracket").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
