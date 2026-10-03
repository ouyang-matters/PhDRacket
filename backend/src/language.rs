//! Display-only detection of a source file's language.
//!
//! This is used for the status bar and editor decorations before anything has
//! been run. It never decides how a program is evaluated: the Racket bridge
//! (backend/racket/private/metadata.rkt) performs the authoritative analysis
//! and reports the language it actually used when the program runs. The two
//! are cross-checked by tests against the compatibility corpus.

use serde::Serialize;

/// The two comment lines DrRacket writes before the `#reader` metadata line
/// (htdp-lib/lang/htdp-langs-save-file-prefix.rkt).
pub const DRRACKET_PREFIX: [&str; 2] = [
    ";; The first three lines of this file were inserted by DrRacket. They record metadata",
    ";; about the language level of this file in a form that our tools can easily process.",
];

/// Number of metadata lines in a DrRacket teaching-language file.
pub const METADATA_LINES: u32 = 3;

pub struct TeachingLanguage {
    pub id: &'static str,
    pub name: &'static str,
    pub short: &'static str,
    pub reader: &'static str,
}

/// Teaching languages as registered by htdp-lib/lang/htdp-langs.rkt.
pub const TEACHING_LANGUAGES: &[TeachingLanguage] = &[
    TeachingLanguage {
        id: "beginner",
        name: "Beginning Student",
        short: "BSL",
        reader: r#"(lib "htdp-beginner-reader.ss" "lang")"#,
    },
    TeachingLanguage {
        id: "beginner-abbr",
        name: "Beginning Student with List Abbreviations",
        short: "BSL+",
        reader: r#"(lib "htdp-beginner-abbr-reader.ss" "lang")"#,
    },
    TeachingLanguage {
        id: "intermediate",
        name: "Intermediate Student",
        short: "ISL",
        reader: r#"(lib "htdp-intermediate-reader.ss" "lang")"#,
    },
    TeachingLanguage {
        id: "intermediate-lambda",
        name: "Intermediate Student with lambda",
        short: "ISL+λ",
        reader: r#"(lib "htdp-intermediate-lambda-reader.ss" "lang")"#,
    },
    TeachingLanguage {
        id: "advanced",
        name: "Advanced Student",
        short: "ASL",
        reader: r#"(lib "htdp-advanced-reader.ss" "lang")"#,
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LanguageKind {
    /// DrRacket teaching-language metadata header.
    Teaching,
    /// A `#lang` line.
    Module,
    /// A DrRacket metadata header PhDRacket does not recognize.
    UnrecognizedMetadata,
    /// Neither metadata nor `#lang`.
    Unspecified,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageSummary {
    pub kind: LanguageKind,
    /// Stable id for teaching languages ("beginner", ...).
    pub id: Option<String>,
    /// Display name, e.g. "Beginning Student" or "#lang racket".
    pub name: String,
    /// Short label for compact UI, e.g. "BSL".
    pub short: String,
    /// The `#lang` argument for module files.
    pub lang_line: Option<String>,
    /// Number of leading metadata lines (3 for teaching-language files).
    pub metadata_lines: u32,
}

/// Detects the language of LF-normalized source text.
pub fn detect_language(text: &str) -> LanguageSummary {
    let mut lines = text.split('\n');
    let first = lines.next();
    let second = lines.next();
    let third = lines.next();
    if first == Some(DRRACKET_PREFIX[0]) && second == Some(DRRACKET_PREFIX[1]) {
        if let Some(reader_line) = third.and_then(|l| l.strip_prefix("#reader")) {
            for lang in TEACHING_LANGUAGES {
                if let Some(rest) = reader_line.strip_prefix(lang.reader) {
                    if rest.trim_start().starts_with('(') {
                        return LanguageSummary {
                            kind: LanguageKind::Teaching,
                            id: Some(lang.id.into()),
                            name: lang.name.into(),
                            short: lang.short.into(),
                            lang_line: None,
                            metadata_lines: METADATA_LINES,
                        };
                    }
                }
            }
            return LanguageSummary {
                kind: LanguageKind::UnrecognizedMetadata,
                id: None,
                name: "Unrecognized DrRacket language".into(),
                short: "?".into(),
                lang_line: None,
                metadata_lines: METADATA_LINES,
            };
        }
    }
    match find_lang_line(text) {
        Some(lang) => LanguageSummary {
            kind: LanguageKind::Module,
            id: None,
            name: format!("#lang {lang}"),
            short: short_for_lang(&lang),
            lang_line: Some(lang),
            metadata_lines: 0,
        },
        None => LanguageSummary {
            kind: LanguageKind::Unspecified,
            id: None,
            name: "No language specified".into(),
            short: "No language".into(),
            lang_line: None,
            metadata_lines: 0,
        },
    }
}

/// The `#lang` line, if it precedes all code (only blank lines, `;` comments
/// and a `#!` line may come first).
fn find_lang_line(text: &str) -> Option<String> {
    for line in text.split('\n') {
        let t = line.trim();
        if t.is_empty() || t.starts_with(';') || t.starts_with("#!/") {
            continue;
        }
        let lang = t.strip_prefix("#lang").filter(|r| r.starts_with([' ', '\t'])).map(str::trim);
        return lang.filter(|l| !l.is_empty()).map(str::to_owned);
    }
    None
}

fn short_for_lang(lang: &str) -> String {
    match lang {
        "htdp/bsl" => "BSL".into(),
        "htdp/bsl+" => "BSL+".into(),
        "htdp/isl" => "ISL".into(),
        "htdp/isl+" => "ISL+λ".into(),
        "htdp/asl" => "ASL".into(),
        other => other.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn teaching(reader: &str) -> String {
        format!(
            "{}\n{}\n#reader{reader}((modname x) (read-case-sensitive #t) (teachpacks ()) \
             (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))\n(+ 1 2)\n",
            DRRACKET_PREFIX[0], DRRACKET_PREFIX[1]
        )
    }

    #[test]
    fn recognizes_every_teaching_language() {
        for lang in TEACHING_LANGUAGES {
            let s = detect_language(&teaching(lang.reader));
            assert_eq!(s.kind, LanguageKind::Teaching);
            assert_eq!(s.id.as_deref(), Some(lang.id));
            assert_eq!(s.metadata_lines, 3);
        }
    }

    #[test]
    fn unknown_reader_is_not_guessed() {
        let s = detect_language(&teaching(r#"(lib "deinprogramm-reader.ss" "lang")"#));
        assert_eq!(s.kind, LanguageKind::UnrecognizedMetadata);
    }

    #[test]
    fn lang_lines() {
        assert_eq!(detect_language("#lang htdp/bsl\n(+ 1 2)").short, "BSL");
        assert_eq!(detect_language(";; c\n\n#lang racket\n").lang_line.as_deref(), Some("racket"));
        assert_eq!(detect_language("(+ 1 2)\n#lang racket\n").kind, LanguageKind::Unspecified);
        assert_eq!(detect_language("").kind, LanguageKind::Unspecified);
    }
}
