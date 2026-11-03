//! The macOS menu bar. Tauri's default one gives Undo, Redo and Select All
//! to the system, which applies them to the web view's text fields. The code
//! editor (Monaco) keeps its text in its own model, so ⌘A did not select the
//! program and ⌘Z bypassed the editor's undo. Here those three items are
//! PhDRacket's own: the window receives a `native-edit` event and applies the
//! action to whatever has focus. Cut, Copy and Paste stay the system's; they
//! reach the editor as ordinary clipboard events.
//!
//! Other platforms have no native menu bar (the window has its own menus).

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

const PREFIX: &str = "native-edit:";

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let name = app.package_info().name.clone();
    let app_menu = Submenu::with_items(
        app,
        name,
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &MenuItem::with_id(app, format!("{PREFIX}undo"), "Undo", true, Some("CmdOrCtrl+Z"))?,
            &MenuItem::with_id(app, format!("{PREFIX}redo"), "Redo", true, Some("CmdOrCtrl+Shift+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &MenuItem::with_id(app, format!("{PREFIX}selectAll"), "Select All", true, Some("CmdOrCtrl+A"))?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window])
}

/// The action of a PhDRacket Edit item ("undo", "redo", "selectAll").
pub fn edit_action(event: &MenuEvent) -> Option<&str> {
    event.id().as_ref().strip_prefix(PREFIX)
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if let Some(action) = edit_action(&event) {
        let _ = app.emit_to("main", "native-edit", action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::menu::MenuId;

    #[test]
    fn edit_items_name_their_action() {
        assert_eq!(edit_action(&MenuEvent { id: MenuId::new("native-edit:selectAll") }), Some("selectAll"));
        assert_eq!(edit_action(&MenuEvent { id: MenuId::new("quit") }), None);
    }
}
