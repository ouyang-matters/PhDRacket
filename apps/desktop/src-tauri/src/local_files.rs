//! Files from the user's computer shown in browser tabs: PDFs, images, HTML
//! pages, text. Web pages still cannot read the computer's files; only files
//! the user opened themselves (address bar, Open File, the Explorer) are
//! served, through a private `phdfile:` protocol:
//!
//! - a file is served only after the user opened it (an HTML page also gets
//!   the rest of its folder, for its images and styles);
//! - only to browser tabs, not to PhDRacket's own window;
//! - not to requests from a web page (they carry a web Origin or Referer),
//!   and with no CORS headers, so a website cannot read them.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder, Url};

pub const SCHEME: &str = "phdfile";

/// What the user opened: files, and folders whose files may also be read.
struct Allowed {
    files: Vec<PathBuf>,
    folders: Vec<PathBuf>,
}

static ALLOWED: Mutex<Allowed> = Mutex::new(Allowed { files: Vec::new(), folders: Vec::new() });

/// Where pages from this protocol come from (their Origin), per platform:
/// Windows serves custom protocols as http://<scheme>.localhost.
fn origin() -> String {
    if cfg!(windows) { format!("http://{SCHEME}.localhost") } else { format!("{SCHEME}://localhost") }
}

/// The browser-tab address of a local file.
pub fn url_for(path: &Path) -> Result<String, String> {
    let file = Url::from_file_path(path).map_err(|_| format!("Not a file path: {}", path.display()))?;
    Ok(format!("{}{}", origin(), file.path()))
}

/// The file a protocol request names (its path is a file URL's path).
pub fn path_of(uri_path: &str) -> Option<PathBuf> {
    if !uri_path.starts_with('/') {
        return None;
    }
    Url::parse(&format!("file://{uri_path}")).ok()?.to_file_path().ok()
}

/// A path the user typed or picked, or a file:// URL.
fn parse_input(input: &str) -> Result<PathBuf, String> {
    let t = input.trim();
    if t.len() > 5 && t[..5].eq_ignore_ascii_case("file:") {
        return Url::parse(t).ok().and_then(|u| u.to_file_path().ok()).ok_or_else(|| format!("Not a file address: {t}"));
    }
    Ok(PathBuf::from(t))
}

fn is_html(p: &Path) -> bool {
    matches!(ext(p).as_str(), "html" | "htm" | "xhtml")
}

fn ext(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default()
}

/// Lets browser tabs show `input` (a path or file:// URL) and returns its
/// address. The file must exist.
pub fn allow(input: &str) -> Result<String, String> {
    let path = parse_input(input)?;
    let real = path.canonicalize().map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    if !real.is_file() {
        return Err(format!("{} is not a file.", path.display()));
    }
    let mut allowed = ALLOWED.lock().unwrap();
    if !allowed.files.contains(&real) {
        allowed.files.push(real.clone());
    }
    if is_html(&real) {
        if let Some(dir) = real.parent() {
            if !allowed.folders.iter().any(|f| f == dir) {
                allowed.folders.push(dir.to_path_buf());
            }
        }
    }
    drop(allowed);
    url_for(&path.canonicalize().map(|p| display_path(&p)).unwrap_or(path))
}

/// Without Windows' \\?\ prefix, for addresses people read.
fn display_path(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => p.to_path_buf(),
    }
}

fn is_allowed(real: &Path) -> bool {
    let allowed = ALLOWED.lock().unwrap();
    allowed.files.iter().any(|f| f == real) || allowed.folders.iter().any(|d| real.starts_with(d))
}

/// A request from a web page: its Origin or Referer is not this protocol's.
fn from_web_page(origin_header: Option<&str>, referer: Option<&str>) -> bool {
    let ours = origin();
    let foreign = |v: &str| !(v == "null" || v == ours || v.starts_with(&format!("{ours}/")));
    origin_header.is_some_and(foreign) || referer.is_some_and(foreign)
}

pub fn content_type(p: &Path) -> &'static str {
    match ext(p).as_str() {
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html; charset=utf-8",
        "xhtml" => "application/xhtml+xml",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        // Racket, text, Markdown and anything else readable: shown as text.
        _ => "text/plain; charset=utf-8",
    }
}

fn respond(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .unwrap()
}

fn answer(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let refuse = |why: &str| respond(StatusCode::FORBIDDEN, "text/plain; charset=utf-8", why.as_bytes().to_vec());
    let text = |h: header::HeaderName| request.headers().get(h).and_then(|v| v.to_str().ok());
    if from_web_page(text(header::ORIGIN), text(header::REFERER)) {
        return refuse("Web pages cannot open files from this computer.");
    }
    let Some(path) = path_of(request.uri().path()) else {
        return refuse("Not a file address.");
    };
    let Ok(real) = path.canonicalize() else {
        return respond(StatusCode::NOT_FOUND, "text/plain; charset=utf-8", format!("{} was not found.", path.display()).into_bytes());
    };
    if !is_allowed(&real) {
        return refuse("Open this file with File > Open File or the address bar first.");
    }
    match std::fs::read(&real) {
        Ok(bytes) => {
            let mut kind = content_type(&real);
            if kind.starts_with("text/plain") && bytes.contains(&0) {
                kind = "application/octet-stream";
            }
            respond(StatusCode::OK, kind, bytes)
        }
        Err(e) => respond(StatusCode::NOT_FOUND, "text/plain; charset=utf-8", e.to_string().into_bytes()),
    }
}

/// The `phdfile:` protocol handler, for browser tabs only.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    if !ctx.webview_label().starts_with("browser-") {
        responder.respond(respond(StatusCode::FORBIDDEN, "text/plain; charset=utf-8", Vec::new()));
        return;
    }
    std::thread::spawn(move || responder.respond(answer(&request)));
}

/// Opens a local file in a browser tab: the address to load.
#[tauri::command]
pub fn browser_local_url(path: String) -> Result<String, String> {
    allow(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("phdracket-local-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn get(url: &str, referer: Option<&str>) -> Response<Vec<u8>> {
        let mut b = Request::builder().uri(url);
        if let Some(r) = referer {
            b = b.header(header::REFERER, r);
        }
        answer(&b.body(Vec::new()).unwrap())
    }

    #[test]
    fn addresses_round_trip() {
        let dir = temp("round");
        let file = dir.join("exam 1 (part a).pdf");
        std::fs::write(&file, b"%PDF").unwrap();
        let url = url_for(&file).unwrap();
        assert!(url.starts_with(&origin()));
        assert!(url.contains("exam%201%20(part%20a).pdf"), "{url}");
        let path = Url::parse(&url).unwrap().path().to_string();
        assert_eq!(path_of(&path).unwrap(), file);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn serves_only_opened_files() {
        let dir = temp("serve");
        let pdf = dir.join("q.pdf");
        let other = dir.join("secret.txt");
        std::fs::write(&pdf, b"%PDF-1.7").unwrap();
        std::fs::write(&other, b"secret").unwrap();
        // Not opened yet.
        assert_eq!(get(&url_for(&pdf).unwrap(), None).status(), StatusCode::FORBIDDEN);
        let url = allow(pdf.to_str().unwrap()).unwrap();
        let ok = get(&url, None);
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "application/pdf");
        assert_eq!(ok.body(), b"%PDF-1.7");
        // Its neighbours stay closed (a PDF does not open its folder).
        assert_eq!(get(&url_for(&other).unwrap(), None).status(), StatusCode::FORBIDDEN);
        // Not through ".." either.
        let sneaky = format!("{}/q.pdf/../secret.txt", url_for(&dir).unwrap());
        assert_eq!(get(&sneaky, None).status(), StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn html_pages_get_their_folder() {
        let dir = temp("html");
        std::fs::create_dir_all(dir.join("img")).unwrap();
        std::fs::write(dir.join("notes.html"), "<img src=img/a.png>").unwrap();
        std::fs::write(dir.join("img/a.png"), b"\x89PNG").unwrap();
        let url = allow(&Url::from_file_path(dir.join("notes.html")).unwrap().to_string()).unwrap();
        assert_eq!(get(&url, None).status(), StatusCode::OK);
        let img = get(&url_for(&dir.join("img/a.png")).unwrap(), Some(&url));
        assert_eq!(img.status(), StatusCode::OK);
        assert_eq!(img.headers()[header::CONTENT_TYPE], "image/png");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn web_pages_cannot_read_files() {
        let dir = temp("web");
        let f = dir.join("answers.txt");
        std::fs::write(&f, "mine").unwrap();
        let url = allow(f.to_str().unwrap()).unwrap();
        assert_eq!(get(&url, Some("https://evil.example/page")).status(), StatusCode::FORBIDDEN);
        assert!(from_web_page(Some("https://evil.example"), None));
        assert!(!from_web_page(Some(&origin()), Some(&format!("{}/x.html", origin()))));
        assert!(!from_web_page(None, None));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_files_and_folders_are_refused() {
        let dir = temp("missing");
        assert!(allow(dir.join("nope.pdf").to_str().unwrap()).is_err());
        assert!(allow(dir.to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn content_types() {
        assert_eq!(content_type(Path::new("a.PDF")), "application/pdf");
        assert_eq!(content_type(Path::new("a.rkt")), "text/plain; charset=utf-8");
        assert_eq!(content_type(Path::new("a.svg")), "image/svg+xml");
    }
}
