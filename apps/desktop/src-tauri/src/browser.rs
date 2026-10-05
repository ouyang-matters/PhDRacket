//! Browser tabs: web pages shown inside the main window, beside the code
//! (frontend/browser). Each tab is a native child webview placed over its
//! editor tab's area, because most course sites refuse to load in frames.
//!
//! Pages are ordinary web pages: they cannot call PhDRacket's commands (the
//! capability in capabilities/default.json covers the app's own pages only),
//! they may only show http(s) pages, and links that open new windows become
//! new browser tabs.

use serde::Serialize;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url, WebviewUrl};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum BrowserEvent {
    /// A page started or finished loading.
    Load { id: String, url: String, loading: bool },
    Title { id: String, title: String },
    /// A link asked for a new window: open it in a new tab.
    NewTab { id: String, url: String },
    /// A link to something other than a web page (mailto:, a file, …), blocked.
    Blocked { id: String, url: String },
}

fn label(id: &str) -> Result<String, String> {
    if id.starts_with("web-") && id.len() < 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(format!("browser-{id}"))
    } else {
        Err("bad browser tab id".into())
    }
}

/// Only web pages: http and https (and blank pages).
pub fn web_url(text: &str) -> Result<Url, String> {
    let url = Url::parse(text.trim()).map_err(|e| format!("Not a web address: {e}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        "about" if url.as_str() == "about:blank" => Ok(url),
        other => Err(format!("Only web pages (http, https) can be opened, not {other}:")),
    }
}

fn webview(app: &AppHandle, id: &str) -> Result<tauri::Webview, String> {
    app.get_webview(&label(id)?).ok_or_else(|| "That browser tab is closed.".to_string())
}

fn bounds(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect { position: LogicalPosition::new(x, y).into(), size: LogicalSize::new(w.max(1.0), h.max(1.0)).into() }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn browser_open(app: AppHandle, id: String, url: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let label = label(&id)?;
    let url = web_url(&url)?;
    if let Some(existing) = app.get_webview(&label) {
        return existing.navigate(url).map_err(|e| e.to_string());
    }
    let window = app.get_window("main").ok_or("no main window")?;
    let (a, b, c, d) = (app.clone(), app.clone(), app.clone(), app.clone());
    let (id1, id2, id3, id4) = (id.clone(), id.clone(), id.clone(), id.clone());
    let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
        .on_page_load(move |_, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            let _ = a.emit("browser", BrowserEvent::Load { id: id1.clone(), url: payload.url().to_string(), loading });
        })
        .on_document_title_changed(move |_, title| {
            let _ = b.emit("browser", BrowserEvent::Title { id: id2.clone(), title });
        })
        .on_new_window(move |url, _| {
            let _ = c.emit("browser", BrowserEvent::NewTab { id: id3.clone(), url: url.to_string() });
            NewWindowResponse::Deny
        })
        .on_navigation(move |url| {
            let ok = matches!(url.scheme(), "http" | "https" | "about" | "data" | "blob");
            if !ok {
                let _ = d.emit("browser", BrowserEvent::Blocked { id: id4.clone(), url: url.to_string() });
            }
            ok
        });
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Places the page over its tab's area, or hides it (another tab is active,
/// or a menu or dialog is open over it).
#[tauri::command]
pub async fn browser_place(app: AppHandle, id: String, x: f64, y: f64, width: f64, height: f64, visible: bool) -> Result<(), String> {
    let w = webview(&app, &id)?;
    if visible {
        w.set_bounds(bounds(x, y, width, height)).map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())
    } else {
        w.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    webview(&app, &id)?.navigate(web_url(&url)?).map_err(|e| e.to_string())
}

/// Back, forward or reload.
#[tauri::command]
pub async fn browser_history(app: AppHandle, id: String, action: String) -> Result<(), String> {
    let w = webview(&app, &id)?;
    match action.as_str() {
        "back" => w.eval("history.back()"),
        "forward" => w.eval("history.forward()"),
        "reload" => w.reload(),
        _ => return Err("unknown action".into()),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_focus(app: AppHandle, id: String) -> Result<(), String> {
    webview(&app, &id)?.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    match app.get_webview(&label(&id)?) {
        Some(w) => w.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_pages() {
        assert!(web_url("https://student.cs.uwaterloo.ca/~cs145/").is_ok());
        assert!(web_url("http://localhost:8000/a.html").is_ok());
        assert!(web_url("about:blank").is_ok());
        for bad in ["file:///C:/x.rkt", "javascript:alert(1)", "tauri://localhost", "ftp://x", "nonsense"] {
            assert!(web_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn tab_ids_become_safe_labels() {
        assert_eq!(label("web-3").unwrap(), "browser-web-3");
        assert!(label("main").is_err());
        assert!(label("web-../x").is_err());
    }
}
