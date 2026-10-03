//! Byte-exact source file IO.
//!
//! Course files must remain ordinary text `.rkt` files. The rules here are:
//!
//! * The editor only ever sees LF-normalized text. The file's original line
//!   ending style and byte-order mark are remembered and re-applied on save.
//! * If the editor text is unchanged since the file was read, saving writes
//!   back the original bytes exactly (this also covers files with mixed line
//!   endings, which no editor model can represent faithfully).
//! * Files that are not plain UTF-8 text (DrRacket WXME files containing
//!   images or boxes, other encodings, binary data) are refused rather than
//!   silently converted.
//! * Nothing is ever added to a file: no headers, markers or metadata.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::language::{detect_language, LanguageSummary};

pub const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

/// Prefix of DrRacket's binary "WXME" editor format (used when a file
/// contains images, comment boxes or other non-text objects).
pub const WXME_PREFIX: &[u8] = b"#reader(lib\"read.ss\"\"wxme\")WXME";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
    /// More than one style (or lone CRs). Untouched files are written back
    /// byte-for-byte; edited files are saved with the dominant style.
    Mixed,
    /// The file contains no line breaks.
    None,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineEndingCounts {
    pub lf: usize,
    pub crlf: usize,
    pub cr: usize,
}

impl LineEndingCounts {
    pub fn of(bytes: &[u8]) -> Self {
        let (mut lf, mut crlf, mut cr) = (0, 0, 0);
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                    crlf += 1;
                    i += 1;
                }
                b'\r' => cr += 1,
                b'\n' => lf += 1,
                _ => {}
            }
            i += 1;
        }
        LineEndingCounts { lf, crlf, cr }
    }

    pub fn style(&self) -> LineEnding {
        match (self.lf, self.crlf, self.cr) {
            (0, 0, 0) => LineEnding::None,
            (_, 0, 0) => LineEnding::Lf,
            (0, _, 0) => LineEnding::Crlf,
            _ => LineEnding::Mixed,
        }
    }

    /// The style used when an edited file must be re-serialized.
    pub fn dominant(&self) -> LineEnding {
        if self.crlf > self.lf + self.cr {
            LineEnding::Crlf
        } else {
            LineEnding::Lf
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    #[error("could not read {path}: {source}")]
    Read { path: PathBuf, source: std::io::Error },
    #[error("could not write {path}: {source}")]
    Write { path: PathBuf, source: std::io::Error },
    #[error(
        "{0} is stored in DrRacket's binary (WXME) format because it contains non-text \
         objects such as images or comment boxes. PhDRacket only edits plain-text \
         source files and will not convert it. Open it in DrRacket instead."
    )]
    Wxme(PathBuf),
    #[error(
        "{0} is not valid UTF-8 text. PhDRacket will not guess its encoding or convert it."
    )]
    NotUtf8(PathBuf),
    #[error("{0} contains NUL bytes and does not look like a plain-text source file.")]
    Binary(PathBuf),
}

/// What PhDRacket remembers about a file as it was read from disk.
#[derive(Debug, Clone)]
pub struct SourceSnapshot {
    pub bytes: Vec<u8>,
    pub text: String,
    pub has_bom: bool,
    pub counts: LineEndingCounts,
}

impl SourceSnapshot {
    pub fn line_ending(&self) -> LineEnding {
        self.counts.style()
    }
}

/// The editor-facing view of an opened file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedSource {
    pub path: PathBuf,
    /// LF-normalized text, without a byte-order mark.
    pub text: String,
    pub line_ending: LineEnding,
    pub has_bom: bool,
    pub sha256: String,
    pub language: LanguageSummary,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Converts any CRLF or lone CR to LF.
pub fn normalize_newlines(s: &str) -> String {
    if !s.contains('\r') {
        return s.to_owned();
    }
    s.replace("\r\n", "\n").replace('\r', "\n")
}

/// Decodes file bytes, refusing anything that is not plain UTF-8 text.
pub fn decode(path: &Path, bytes: Vec<u8>) -> Result<SourceSnapshot, SourceError> {
    let has_bom = bytes.starts_with(UTF8_BOM);
    let body = if has_bom { &bytes[UTF8_BOM.len()..] } else { &bytes[..] };
    if body.starts_with(WXME_PREFIX) {
        return Err(SourceError::Wxme(path.to_owned()));
    }
    if body.contains(&0) {
        return Err(SourceError::Binary(path.to_owned()));
    }
    let text = std::str::from_utf8(body).map_err(|_| SourceError::NotUtf8(path.to_owned()))?;
    let counts = LineEndingCounts::of(body);
    let text = normalize_newlines(text);
    Ok(SourceSnapshot { bytes, text, has_bom, counts })
}

pub fn read_snapshot(path: &Path) -> Result<SourceSnapshot, SourceError> {
    let bytes = fs::read(path).map_err(|source| SourceError::Read { path: path.to_owned(), source })?;
    decode(path, bytes)
}

pub fn open(path: &Path) -> Result<(OpenedSource, SourceSnapshot), SourceError> {
    let snap = read_snapshot(path)?;
    let opened = OpenedSource {
        path: path.to_owned(),
        text: snap.text.clone(),
        line_ending: snap.line_ending(),
        has_bom: snap.has_bom,
        sha256: sha256_hex(&snap.bytes),
        language: detect_language(&snap.text),
    };
    Ok((opened, snap))
}

/// Serializes LF-normalized editor text with the given conventions.
pub fn serialize(text: &str, line_ending: LineEnding, has_bom: bool) -> Vec<u8> {
    let text = normalize_newlines(text);
    let body = match line_ending {
        LineEnding::Crlf => text.replace('\n', "\r\n"),
        _ => text,
    };
    let mut out = Vec::with_capacity(body.len() + 3);
    if has_bom {
        out.extend_from_slice(UTF8_BOM);
    }
    out.extend_from_slice(body.as_bytes());
    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    pub path: PathBuf,
    pub bytes_written: usize,
    pub sha256: String,
    /// True when the original bytes were written back unchanged.
    pub identical_to_original: bool,
    /// True when a mixed-line-ending file had its line endings unified.
    pub line_endings_normalized: bool,
}

/// Computes the bytes to write for `text`, given what was originally read.
pub fn bytes_for_save(snapshot: Option<&SourceSnapshot>, text: &str) -> (Vec<u8>, bool, bool) {
    let text = normalize_newlines(text);
    match snapshot {
        Some(snap) if snap.text == text => (snap.bytes.clone(), true, false),
        Some(snap) => {
            let style = match snap.line_ending() {
                LineEnding::Mixed => snap.counts.dominant(),
                LineEnding::None => LineEnding::Lf,
                s => s,
            };
            let normalized = snap.line_ending() == LineEnding::Mixed;
            (serialize(&text, style, snap.has_bom), false, normalized)
        }
        None => (serialize(&text, LineEnding::Lf, false), false, false),
    }
}

/// Writes `bytes` to `path` via a temporary file in the same directory, so a
/// failed write never leaves a truncated source file behind.
pub fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), SourceError> {
    let err = |source| SourceError::Write { path: path.to_owned(), source };
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = dir.join(format!(".{name}.phdracket-{}.tmp", std::process::id()));
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(err)
}

/// Saves editor text. Returns the outcome and the new snapshot.
pub fn save(
    path: &Path,
    snapshot: Option<&SourceSnapshot>,
    text: &str,
) -> Result<(SaveOutcome, SourceSnapshot), SourceError> {
    let (bytes, identical, normalized) = bytes_for_save(snapshot, text);
    write_atomically(path, &bytes)?;
    let outcome = SaveOutcome {
        path: path.to_owned(),
        bytes_written: bytes.len(),
        sha256: sha256_hex(&bytes),
        identical_to_original: identical,
        line_endings_normalized: normalized,
    };
    let snap = decode(path, bytes)?;
    Ok((outcome, snap))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(bytes: &[u8]) -> SourceSnapshot {
        decode(Path::new("t.rkt"), bytes.to_vec()).unwrap()
    }

    #[test]
    fn untouched_text_round_trips_exactly() {
        for bytes in [
            &b"(define x 1)\n"[..],
            b"(define x 1)\r\n(+ x 1)\r\n",
            b"\xEF\xBB\xBF(define x 1)\n",
            b"a\nb\r\nc\rd",
            b"no newline at end",
            b"",
        ] {
            let s = snap(bytes);
            let (out, identical, _) = bytes_for_save(Some(&s), &s.text);
            assert!(identical);
            assert_eq!(out, bytes);
        }
    }

    #[test]
    fn edited_text_keeps_conventions() {
        let s = snap(b"\xEF\xBB\xBF(a)\r\n(b)\r\n");
        let (out, identical, normalized) = bytes_for_save(Some(&s), "(a)\n(c)\n");
        assert!(!identical && !normalized);
        assert_eq!(out, b"\xEF\xBB\xBF(a)\r\n(c)\r\n");
    }

    #[test]
    fn edited_mixed_file_uses_dominant_style() {
        let s = snap(b"1\r\n2\r\n3\n");
        assert_eq!(s.line_ending(), LineEnding::Mixed);
        let (out, _, normalized) = bytes_for_save(Some(&s), "1\n2\n3\n4\n");
        assert!(normalized);
        assert_eq!(out, b"1\r\n2\r\n3\r\n4\r\n");
    }

    #[test]
    fn editor_text_never_contains_carriage_returns() {
        assert_eq!(snap(b"a\r\nb\rc\n").text, "a\nb\nc\n");
    }

    #[test]
    fn refuses_non_text_files() {
        let p = Path::new("x.rkt");
        assert!(matches!(
            decode(p, b"#reader(lib\"read.ss\"\"wxme\")WXME0108 ## \n".to_vec()),
            Err(SourceError::Wxme(_))
        ));
        assert!(matches!(decode(p, vec![0xff, 0xfe, 0x41]), Err(SourceError::NotUtf8(_))));
        assert!(matches!(decode(p, b"(a)\0".to_vec()), Err(SourceError::Binary(_))));
    }
}
