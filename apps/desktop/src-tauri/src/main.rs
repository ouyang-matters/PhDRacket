// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(commands::AppState::default())
        .setup(|app| {
            commands::start_runtime(app.handle().clone(), None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status,
            commands::runtime_discover,
            commands::runtime_select,
            commands::source_open,
            commands::source_save,
            commands::source_save_as,
            commands::source_close,
            commands::run_program,
            commands::eval_interaction,
            commands::stop_program,
            commands::step_program,
            commands::stop_stepper,
            commands::settings_get,
            commands::settings_set_ui,
            commands::app_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building PhDRacket")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                commands::shutdown(app);
            }
        });
}
