// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::AppState::default())
        .setup(|app| {
            commands::start_runtime(app.handle().clone(), None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status,
            commands::runtime_discover,
            commands::runtime_select,
            commands::runtime_install_plan,
            commands::runtime_install,
            commands::source_open,
            commands::source_save,
            commands::source_save_as,
            commands::source_close,
            commands::run_program,
            commands::eval_interaction,
            commands::stop_program,
            commands::step_program,
            commands::stop_stepper,
            commands::announcements_fetch,
            commands::workspace_list,
            commands::workspace_files,
            commands::workspace_search,
            commands::workspace_set_folder,
            commands::workspace_watch,
            commands::debug_program,
            commands::debug_control,
            commands::check_program,
            browser::browser_open,
            browser::browser_place,
            browser::browser_navigate,
            browser::browser_history,
            browser::browser_focus,
            browser::browser_close,
            commands::fs_list,
            commands::fs_create_file,
            commands::fs_create_dir,
            commands::fs_rename,
            commands::fs_duplicate,
            commands::fs_copy,
            commands::fs_move,
            commands::fs_trash,
            commands::fs_properties,
            commands::fs_folder_stats,
            commands::fs_reveal,
            commands::settings_get,
            commands::settings_set_ui,
            commands::app_info,
            commands::remote_probe,
            commands::remote_run,
            commands::remote_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("error while building PhDRacket")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                commands::shutdown(app);
            }
        });
}
