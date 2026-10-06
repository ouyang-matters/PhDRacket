//! Version control through the user's own `git` (the Source Control view).
//!
//! Every operation runs `git -C <folder> ...` with fixed arguments (no shell),
//! never prompts (GIT_TERMINAL_PROMPT=0), and works on the repository that
//! contains the open folder. Paths given by the UI must be inside that
//! repository. Nothing here rewrites history: there is no reset, rebase or
//! force push; Pull only fast-forwards.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::runtime::hide_console;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Git is not installed (or not on PATH).")]
    Missing,
    #[error("{0}")]
    Failed(String),
    #[error("{0} is outside the repository")]
    Outside(String),
}

pub type Result<T> = std::result::Result<T, GitError>;

fn git(dir: &Path) -> Command {
    let mut c = Command::new("git");
    c.arg("-C").arg(dir);
    // Plain output, no pagers, editors or prompts, and status must not take locks.
    c.env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_PAGER", "cat")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C");
    hide_console(&mut c);
    c
}

/// Runs git; stdout as bytes, or the error git printed.
fn run(dir: &Path, args: &[&str], stdin: Option<&str>) -> Result<Vec<u8>> {
    let mut cmd = git(dir);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() });
    let mut child = cmd.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => GitError::Missing,
        _ => GitError::Failed(e.to_string()),
    })?;
    if let (Some(text), Some(mut pipe)) = (stdin, child.stdin.take()) {
        pipe.write_all(text.as_bytes()).map_err(|e| GitError::Failed(e.to_string()))?;
    }
    let out = child.wait_with_output().map_err(|e| GitError::Failed(e.to_string()))?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let msg = if msg.is_empty() { String::from_utf8_lossy(&out.stdout).trim().to_string() } else { msg };
        Err(GitError::Failed(msg))
    }
}

fn text(b: Vec<u8>) -> String {
    String::from_utf8_lossy(&b).into_owned()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// Path relative to the repository root, with forward slashes.
    pub path: String,
    /// The full path.
    pub abs: PathBuf,
    /// Original path of a rename or copy.
    pub from: Option<String>,
    /// Status in the index (staged) and in the working tree: one of
    /// '.', 'M', 'A', 'D', 'R', 'C', 'U' (conflict), '?' (untracked).
    pub index: char,
    pub worktree: char,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// The repository's top folder.
    pub root: PathBuf,
    /// Current branch; None when HEAD is detached.
    pub branch: Option<String>,
    /// Short commit id of HEAD; None before the first commit.
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<FileChange>,
}

/// Parses `git status --porcelain=v2 --branch -z`.
pub fn parse_status(root: &Path, out: &str) -> Status {
    let mut s = Status { root: root.to_path_buf(), ..Default::default() };
    let mut fields = out.split('\0').peekable();
    let abs = |p: &str| root.join(p.replace('/', std::path::MAIN_SEPARATOR_STR));
    while let Some(entry) = fields.next() {
        if entry.is_empty() {
            continue;
        }
        if let Some(h) = entry.strip_prefix("# ") {
            let (key, value) = h.split_once(' ').unwrap_or((h, ""));
            match key {
                "branch.oid" if value != "(initial)" => s.head = Some(value.chars().take(7).collect()),
                "branch.head" if value != "(detached)" => s.branch = Some(value.to_string()),
                "branch.upstream" => s.upstream = Some(value.to_string()),
                "branch.ab" => {
                    for part in value.split(' ') {
                        if let Some(n) = part.strip_prefix('+') {
                            s.ahead = n.parse().unwrap_or(0);
                        } else if let Some(n) = part.strip_prefix('-') {
                            s.behind = n.parse().unwrap_or(0);
                        }
                    }
                }
                _ => {}
            }
            continue;
        }
        let kind = entry.chars().next().unwrap_or(' ');
        match kind {
            '1' | 'u' => {
                // 1 XY sub mH mI mW hH hI path   /   u XY sub m1 m2 m3 mW h1 h2 h3 path
                let n = if kind == '1' { 8 } else { 10 };
                let parts: Vec<&str> = entry.splitn(n + 1, ' ').collect();
                if parts.len() == n + 1 {
                    let xy: Vec<char> = parts[1].chars().collect();
                    let (x, y) = if kind == 'u' { ('U', 'U') } else { (xy[0], xy[1]) };
                    s.files.push(FileChange { path: parts[n].to_string(), abs: abs(parts[n]), from: None, index: x, worktree: y });
                }
            }
            '2' => {
                // 2 XY sub mH mI mW hH hI Xscore path \0 origPath
                let parts: Vec<&str> = entry.splitn(10, ' ').collect();
                if parts.len() == 10 {
                    let xy: Vec<char> = parts[1].chars().collect();
                    let from = fields.next().map(|f| f.to_string());
                    s.files.push(FileChange { path: parts[9].to_string(), abs: abs(parts[9]), from, index: xy[0], worktree: xy[1] });
                }
            }
            '?' => {
                let p = &entry[2..];
                s.files.push(FileChange { path: p.to_string(), abs: abs(p), from: None, index: '?', worktree: '?' });
            }
            _ => {}
        }
    }
    s
}

/// The repository's top folder, or None if `dir` is not in a repository.
pub fn root(dir: &Path) -> Result<Option<PathBuf>> {
    match run(dir, &["rev-parse", "--show-toplevel"], None) {
        Ok(out) => Ok(Some(PathBuf::from(text(out).trim()))),
        Err(GitError::Missing) => Err(GitError::Missing),
        Err(_) => Ok(None),
    }
}

pub fn version() -> Result<String> {
    Ok(text(run(Path::new("."), &["--version"], None)?).trim().to_string())
}

pub fn status(dir: &Path) -> Result<Option<Status>> {
    let Some(root) = root(dir)? else { return Ok(None) };
    let out = run(&root, &["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"], None)?;
    Ok(Some(parse_status(&root, &text(out))))
}

/// A path inside the repository, relative with forward slashes.
fn relative(root: &Path, path: &Path) -> Result<String> {
    let canon = |p: &Path| dunce(p.canonicalize().unwrap_or_else(|_| p.to_path_buf()));
    let r = canon(root);
    let p = if path.exists() { canon(path) } else { canon(path.parent().unwrap_or(path)).join(path.file_name().unwrap_or_default()) };
    let rel = p.strip_prefix(&r).map_err(|_| GitError::Outside(path.display().to_string()))?;
    if rel.as_os_str().is_empty() {
        return Err(GitError::Outside(path.display().to_string()));
    }
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

/// Removes Windows' `\\?\` prefix from canonical paths.
fn dunce(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => p,
    }
}

fn repo(dir: &Path) -> Result<PathBuf> {
    root(dir)?.ok_or_else(|| GitError::Failed("This folder is not in a Git repository.".into()))
}

/// A file's text at a revision: "HEAD", a commit id, or "" for the index.
/// None when the file does not exist there.
pub fn show(dir: &Path, rev: &str, path: &Path) -> Result<Option<String>> {
    let root = repo(dir)?;
    let rel = relative(&root, path)?;
    if !rev.is_empty() && !rev.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '^' | '~' | '/' | '-' | '_' | '.')) {
        return Err(GitError::Failed("bad revision".into()));
    }
    if rev.starts_with('-') {
        return Err(GitError::Failed("bad revision".into()));
    }
    let spec = format!("{rev}:{rel}");
    match run(&root, &["show", &spec], None) {
        Ok(out) => Ok(Some(text(out))),
        Err(GitError::Missing) => Err(GitError::Missing),
        Err(_) => Ok(None),
    }
}

fn rels(root: &Path, paths: &[PathBuf]) -> Result<Vec<String>> {
    paths.iter().map(|p| relative(root, p)).collect()
}

fn with_paths<'a>(args: &[&'a str], paths: &'a [String]) -> Vec<&'a str> {
    let mut v: Vec<&str> = args.to_vec();
    v.push("--");
    v.extend(paths.iter().map(String::as_str));
    v
}

pub fn stage(dir: &Path, paths: &[PathBuf]) -> Result<()> {
    let root = repo(dir)?;
    let rel = rels(&root, paths)?;
    run(&root, &with_paths(&["add", "-A"], &rel), None).map(|_| ())
}

pub fn unstage(dir: &Path, paths: &[PathBuf]) -> Result<()> {
    let root = repo(dir)?;
    let rel = rels(&root, paths)?;
    // Before the first commit there is no HEAD to restore from.
    if run(&root, &["rev-parse", "--verify", "-q", "HEAD"], None).is_ok() {
        run(&root, &with_paths(&["restore", "--staged"], &rel), None).map(|_| ())
    } else {
        run(&root, &with_paths(&["rm", "--cached", "-q", "-r"], &rel), None).map(|_| ())
    }
}

/// Discards working-tree changes of tracked files (back to the index).
/// Untracked files are not touched here; the UI moves them to the Recycle Bin.
pub fn discard(dir: &Path, paths: &[PathBuf]) -> Result<()> {
    let root = repo(dir)?;
    let rel = rels(&root, paths)?;
    run(&root, &with_paths(&["restore", "--worktree"], &rel), None).map(|_| ())
}

/// Commits the staged changes; returns the new short commit id.
pub fn commit(dir: &Path, message: &str) -> Result<String> {
    let root = repo(dir)?;
    if message.trim().is_empty() {
        return Err(GitError::Failed("A commit message is required.".into()));
    }
    run(&root, &["commit", "-q", "-F", "-"], Some(message))?;
    Ok(text(run(&root, &["rev-parse", "--short", "HEAD"], None)?).trim().to_string())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short: String,
    pub author: String,
    /// Seconds since the Unix epoch.
    pub time: i64,
    pub subject: String,
    /// Branch and tag names pointing here.
    pub refs: String,
}

pub fn log(dir: &Path, limit: u32, path: Option<&Path>) -> Result<Vec<Commit>> {
    let root = repo(dir)?;
    if run(&root, &["rev-parse", "--verify", "-q", "HEAD"], None).is_err() {
        return Ok(vec![]);
    }
    let n = format!("-n{}", limit.clamp(1, 500));
    let mut args = vec!["log", &n, "--format=%H%x1f%h%x1f%an%x1f%at%x1f%s%x1f%D%x1e"];
    let rel;
    if let Some(p) = path {
        rel = relative(&root, p)?;
        args.push("--");
        args.push(&rel);
    }
    let out = text(run(&root, &args, None)?);
    Ok(out
        .split('\u{1e}')
        .filter_map(|rec| {
            let f: Vec<&str> = rec.trim_start_matches('\n').split('\u{1f}').collect();
            (f.len() == 6).then(|| Commit {
                sha: f[0].into(),
                short: f[1].into(),
                author: f[2].into(),
                time: f[3].parse().unwrap_or(0),
                subject: f[4].into(),
                refs: f[5].into(),
            })
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub status: char,
    pub path: String,
    pub abs: PathBuf,
}

/// Files a commit changed (compared with its first parent).
pub fn commit_files(dir: &Path, sha: &str) -> Result<Vec<CommitFile>> {
    let root = repo(dir)?;
    if !sha.chars().all(|c| c.is_ascii_hexdigit()) || sha.is_empty() {
        return Err(GitError::Failed("bad commit id".into()));
    }
    let out = text(run(&root, &["show", "--name-status", "--format=", "-z", "--no-renames", sha], None)?);
    let parts: Vec<&str> = out.split('\0').filter(|s| !s.is_empty()).collect();
    Ok(parts
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| CommitFile {
            status: c[0].chars().next().unwrap_or('M'),
            path: c[1].to_string(),
            abs: root.join(c[1].replace('/', std::path::MAIN_SEPARATOR_STR)),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
    pub upstream: Option<String>,
}

pub fn branches(dir: &Path) -> Result<Vec<Branch>> {
    let root = repo(dir)?;
    let out = text(run(
        &root,
        &["for-each-ref", "--format=%(refname)%1f%(refname:short)%1f%(HEAD)%1f%(upstream:short)", "refs/heads", "refs/remotes"],
        None,
    )?);
    Ok(out
        .lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.split('\u{1f}').collect();
            (f.len() == 4 && !f[0].ends_with("/HEAD")).then(|| Branch {
                name: f[1].into(),
                current: f[2] == "*",
                remote: f[0].starts_with("refs/remotes/"),
                upstream: (!f[3].is_empty()).then(|| f[3].to_string()),
            })
        })
        .collect())
}

fn check_branch(root: &Path, name: &str) -> Result<()> {
    if name.starts_with('-') {
        return Err(GitError::Failed(format!("\"{name}\" is not a valid branch name.")));
    }
    run(root, &["check-ref-format", "--branch", name], None)
        .map(|_| ())
        .map_err(|_| GitError::Failed(format!("\"{name}\" is not a valid branch name.")))
}

/// Switches to a branch (a remote branch creates a local one tracking it).
/// Git refuses when uncommitted changes would be overwritten.
pub fn switch(dir: &Path, name: &str) -> Result<()> {
    let root = repo(dir)?;
    check_branch(&root, name)?;
    run(&root, &["switch", name], None).map(|_| ())
}

pub fn create_branch(dir: &Path, name: &str) -> Result<()> {
    let root = repo(dir)?;
    check_branch(&root, name)?;
    run(&root, &["switch", "-c", name], None).map(|_| ())
}

pub fn init(dir: &Path) -> Result<()> {
    run(dir, &["init", "-q"], None).map(|_| ())
}

/// Fetch, Pull (fast-forward only) or Push (setting the upstream the first time).
pub fn sync(dir: &Path, op: &str) -> Result<String> {
    let root = repo(dir)?;
    let out = match op {
        "fetch" => run(&root, &["fetch", "--prune"], None)?,
        "pull" => run(&root, &["pull", "--ff-only"], None)?,
        "push" => {
            let has_upstream = run(&root, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], None).is_ok();
            if has_upstream {
                run(&root, &["push"], None)?
            } else {
                run(&root, &["push", "-u", "origin", "HEAD"], None)?
            }
        }
        _ => return Err(GitError::Failed("unknown operation".into())),
    };
    Ok(text(out).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_porcelain_v2() {
        let out = "# branch.oid 1234567890abcdef\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0\
1 .M N... 100644 100644 100644 aaa bbb src/a.rkt\0\
1 A. N... 000000 100644 100644 000 ccc new.rkt\0\
2 R. N... 100644 100644 100644 ddd eee R100 moved.rkt\0old.rkt\0\
u UU N... 100644 100644 100644 100644 f1 f2 f3 conflict.rkt\0\
? notes.txt\0";
        let s = parse_status(Path::new("/repo"), out);
        assert_eq!((s.branch.as_deref(), s.head.as_deref(), s.ahead, s.behind), (Some("main"), Some("1234567"), 2, 1));
        let summary: Vec<(String, char, char)> = s.files.iter().map(|f| (f.path.clone(), f.index, f.worktree)).collect();
        assert_eq!(
            summary,
            vec![
                ("src/a.rkt".into(), '.', 'M'),
                ("new.rkt".into(), 'A', '.'),
                ("moved.rkt".into(), 'R', '.'),
                ("conflict.rkt".into(), 'U', 'U'),
                ("notes.txt".into(), '?', '?'),
            ]
        );
        assert_eq!(s.files[2].from.as_deref(), Some("old.rkt"));
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("phdracket-git-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn works_with_a_real_repository() {
        if version().is_err() {
            eprintln!("skipping: git is not installed");
            return;
        }
        let d = tmp("repo");
        assert!(status(&d).unwrap().is_none(), "not a repository yet");
        init(&d).unwrap();
        run(&d, &["config", "user.email", "t@example.com"], None).unwrap();
        run(&d, &["config", "user.name", "Test"], None).unwrap();
        run(&d, &["config", "core.autocrlf", "false"], None).unwrap();
        let a = d.join("a.rkt");
        fs::write(&a, "#lang racket\n(define x 1)\n").unwrap();
        let s = status(&d).unwrap().unwrap();
        assert_eq!(s.files[0].index, '?');
        assert_eq!(s.head, None);
        stage(&d, std::slice::from_ref(&a)).unwrap();
        assert_eq!(status(&d).unwrap().unwrap().files[0].index, 'A');
        unstage(&d, std::slice::from_ref(&a)).unwrap();
        assert_eq!(status(&d).unwrap().unwrap().files[0].index, '?');
        stage(&d, std::slice::from_ref(&a)).unwrap();
        let first = commit(&d, "First version").unwrap();
        assert!(!first.is_empty());
        fs::write(&a, "#lang racket\n(define x 2)\n").unwrap();
        assert_eq!(show(&d, "HEAD", &a).unwrap().as_deref(), Some("#lang racket\n(define x 1)\n"));
        assert_eq!(status(&d).unwrap().unwrap().files[0].worktree, 'M');
        discard(&d, std::slice::from_ref(&a)).unwrap();
        assert_eq!(fs::read_to_string(&a).unwrap(), "#lang racket\n(define x 1)\n");
        create_branch(&d, "try").unwrap();
        assert!(branches(&d).unwrap().iter().any(|b| b.name == "try" && b.current));
        assert!(create_branch(&d, "-bad").is_err());
        let log = log(&d, 10, Some(&a)).unwrap();
        assert_eq!(log[0].subject, "First version");
        assert_eq!(commit_files(&d, &log[0].sha).unwrap()[0].path, "a.rkt");
        assert!(matches!(show(&d, "HEAD", Path::new("C:/elsewhere/x.rkt")), Err(GitError::Outside(_))) || cfg!(not(windows)));
        fs::remove_dir_all(&d).ok();
    }
}
