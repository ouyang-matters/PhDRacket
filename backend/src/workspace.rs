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

/// Files under `root` (recursively, hidden entries and build folders
/// skipped), as paths, at most `limit` of them. Read-only.
pub fn list_files(root: &Path, limit: usize) -> std::io::Result<Vec<PathBuf>> {
    fn walk(dir: &Path, depth: usize, limit: usize, out: &mut Vec<PathBuf>) {
        // Unreadable subfolders are skipped; very deep trees are cut off.
        let Ok(entries) = list_dir(dir) else { return };
        for e in entries {
            if out.len() >= limit {
                return;
            }
            if e.is_dir {
                if depth < 32 {
                    walk(&e.path, depth + 1, limit, out);
                }
            } else {
                out.push(e.path);
            }
        }
    }
    list_dir(root)?;
    let mut out = Vec::new();
    walk(root, 0, limit, &mut out);
    Ok(out)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: PathBuf,
    /// 1-based line number.
    pub line: usize,
    /// 1-based column of the match, in characters.
    pub column: usize,
    pub text: String,
}

/// Extensions searched by Find in Files.
const SEARCHED: &[&str] = &["rkt", "rktl", "rktd", "scm", "ss", "txt", "md"];

/// Lines containing `query` in the text files under `root`. Read-only; files
/// that are not UTF-8 text are skipped.
pub fn search(root: &Path, query: &str, case_sensitive: bool, limit: usize) -> std::io::Result<Vec<SearchMatch>> {
    let mut out = Vec::new();
    if query.is_empty() {
        return Ok(out);
    }
    let needle = if case_sensitive { query.to_owned() } else { query.to_lowercase() };
    for path in list_files(root, 20_000)? {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if !SEARCHED.contains(&ext.as_str()) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else { continue };
        for (i, line) in text.lines().enumerate() {
            let hay = if case_sensitive { line.to_owned() } else { line.to_lowercase() };
            if let Some(byte) = hay.find(&needle) {
                let column = hay[..byte].chars().count() + 1;
                out.push(SearchMatch { path: path.clone(), line: i + 1, column, text: line.chars().take(400).collect() });
                if out.len() >= limit {
                    return Ok(out);
                }
            }
        }
    }
    Ok(out)
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

    #[test]
    fn lists_files_recursively_and_searches_text() {
        let dir = std::env::temp_dir().join(format!("phdracket-ws-search-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("A3").join("compiled")).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join("A3").join("a3.rkt"), "(define (Count xs) 0)\n(count 1)\n").unwrap();
        fs::write(dir.join("A3").join("compiled").join("a3_rkt.zo"), "count").unwrap();
        fs::write(dir.join(".git").join("HEAD"), "count").unwrap();
        fs::write(dir.join("notes.txt"), "no match\n").unwrap();
        fs::write(dir.join("image.png"), [0u8, 159, 146, 150]).unwrap();
        let names: Vec<String> = list_files(&dir, 100)
            .unwrap()
            .iter()
            .map(|p| p.strip_prefix(&dir).unwrap().to_string_lossy().replace('\\', "/"))
            .collect();
        assert_eq!(names, ["A3/a3.rkt", "image.png", "notes.txt"]);
        assert_eq!(list_files(&dir, 1).unwrap().len(), 1);

        let found = search(&dir, "count", false, 100).unwrap();
        assert_eq!(found.iter().map(|m| (m.line, m.column)).collect::<Vec<_>>(), [(1, 10), (2, 2)]);
        assert_eq!(search(&dir, "count", true, 100).unwrap().len(), 1);
        assert!(search(&dir, "", false, 100).unwrap().is_empty());
        // Searching changes nothing.
        assert!(!dir.join(".phdracket").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
