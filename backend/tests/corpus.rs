//! Compatibility tests A, G and H (docs/TESTING.md), run over every file in
//! compatibility-tests/corpus, plus a cross-check of display-only language
//! detection against what the Racket bridge reported (golden transcripts).

use std::fs;
use std::path::{Path, PathBuf};

use phdracket_core::language::LanguageKind;
use phdracket_core::source;

fn corpus_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../compatibility-tests/corpus")
}

fn corpus_files() -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        for e in fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.extension().is_some_and(|x| x == "rkt") {
                out.push(p);
            }
        }
    }
    let mut v = Vec::new();
    walk(&corpus_root(), &mut v);
    v.sort();
    assert!(v.len() >= 10, "corpus missing?");
    v
}

fn scratch_copy(test: &str, original: &Path) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("phdracket-{test}-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let rel = original.strip_prefix(corpus_root()).unwrap();
    let dest = dir.join(rel.to_string_lossy().replace(['/', '\\'], "__"));
    fs::copy(original, &dest).unwrap();
    dest
}

/// Test A: open + save without edits leaves the file byte-identical.
#[test]
fn test_a_untouched_save_is_byte_identical() {
    for f in corpus_files() {
        let copy = scratch_copy("a", &f);
        let before = source::sha256_hex(&fs::read(&copy).unwrap());
        let (opened, snap) = source::open(&copy).unwrap();
        let (outcome, _) = source::save(&copy, Some(&snap), &opened.text).unwrap();
        let after = source::sha256_hex(&fs::read(&copy).unwrap());
        assert_eq!(before, after, "{}", f.display());
        assert!(outcome.identical_to_original);
        fs::remove_file(copy).unwrap();
    }
}

/// Test G: a newly created file is plain UTF-8 text with nothing added.
#[test]
fn test_g_new_files_are_plain_text() {
    let dir = std::env::temp_dir().join(format!("phdracket-new-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let p = dir.join("new.rkt");
    let text = "#lang htdp/bsl\n(define (f x) \"λ\")\n";
    source::save(&p, None, text).unwrap();
    let bytes = fs::read(&p).unwrap();
    assert_eq!(bytes, text.as_bytes(), "exactly the editor text, LF, no BOM, no header");
    assert!(std::str::from_utf8(&bytes).is_ok());
    assert!(!bytes.contains(&0));
    let (_, snap) = source::open(&p).unwrap();
    assert_eq!(snap.text, text);
    fs::remove_dir_all(dir).unwrap();
}

/// Test H: editing the body of a teaching-language file leaves its metadata
/// lines byte-identical.
#[test]
fn test_h_metadata_lines_survive_body_edits() {
    for f in corpus_files() {
        let copy = scratch_copy("h", &f);
        let (opened, snap) = source::open(&copy).unwrap();
        if opened.language.kind != LanguageKind::Teaching {
            fs::remove_file(copy).unwrap();
            continue;
        }
        let original = fs::read(&copy).unwrap();
        let edited = format!("{}\n(define phdracket-edit 1)\n", opened.text.trim_end_matches('\n'));
        source::save(&copy, Some(&snap), &edited).unwrap();
        let saved = fs::read(&copy).unwrap();
        let header_len = nth_line_end(&original, 3);
        assert_eq!(&saved[..header_len], &original[..header_len], "{}", f.display());
        fs::remove_file(copy).unwrap();
    }
}

fn nth_line_end(bytes: &[u8], n: usize) -> usize {
    let mut seen = 0;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\n' {
            seen += 1;
            if seen == n {
                return i + 1;
            }
        }
    }
    bytes.len()
}

/// Display-only detection must agree with the language the bridge used
/// (first line of each golden transcript, produced by the real bridge).
#[test]
fn detection_agrees_with_bridge_transcripts() {
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("../compatibility-tests/expected");
    for f in corpus_files() {
        let rel = f.strip_prefix(corpus_root()).unwrap().to_string_lossy().replace('\\', "/");
        let transcript = expected.join(format!("{rel}.transcript"));
        let Ok(t) = fs::read_to_string(&transcript) else { panic!("missing {}", transcript.display()) };
        let bridge_line = t.lines().next().unwrap();
        let (opened, _) = source::open(&f).unwrap();
        let l = &opened.language;
        let ours = match l.kind {
            LanguageKind::Teaching => format!("language: teaching {}", l.name),
            LanguageKind::Module => format!("language: module {}", l.lang_line.as_deref().unwrap()),
            LanguageKind::Unspecified => "language: module null".to_owned(),
            LanguageKind::UnrecognizedMetadata => "language: unrecognized-metadata".to_owned(),
        };
        assert_eq!(ours, bridge_line, "{rel}");
    }
}
