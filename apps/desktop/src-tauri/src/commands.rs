//! Typed IPC commands. The frontend never evaluates or interprets Racket; it
//! sends text here and renders the events the bridge reports.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use phdracket_core::engine::{Engine, RunHandle};
use phdracket_core::runtime::{self, RuntimeInfo};
use phdracket_core::settings::Settings;
use phdracket_core::source::{self, OpenedSource, SaveOutcome, SourceSnapshot};
use phdracket_core::bridge;
use phdracket_core::workspace::{self, DirEntry};
use phdracket_core::install::{self, InstallProgress, InstallerInfo};
use phdracket_core::remote;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeState {
    #[default]
    Detecting,
    Ready,
    Missing,
    Error,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub state: RuntimeState,
    pub runtime: Option<RuntimeInfo>,
    pub message: Option<String>,
}

#[derive(Default)]
pub struct AppState {
    engine: Mutex<Option<Arc<Engine>>>,
    status: Mutex<RuntimeStatus>,
    snapshots: Mutex<HashMap<PathBuf, SourceSnapshot>>,
    settings: Mutex<Option<Settings>>,
    remote_tasks: Mutex<HashMap<u64, remote::Task>>,
    next_task: Mutex<u64>,
}

/// The settings file. PHDRACKET_SETTINGS_FILE overrides it (used by the
/// end-to-end test so it never touches a user's settings).
fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("PHDRACKET_SETTINGS_FILE") {
        return Some(PathBuf::from(p));
    }
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn with_settings<R>(app: &AppHandle, f: impl FnOnce(&mut Settings) -> R) -> R {
    let state = app.state::<AppState>();
    let mut guard = state.settings.lock().unwrap();
    let settings = guard.get_or_insert_with(|| {
        settings_path(app).map(|p| Settings::load(&p)).unwrap_or_default()
    });
    f(settings)
}

fn persist_settings(app: &AppHandle) {
    let snapshot = with_settings(app, |s| s.clone());
    if let Some(p) = settings_path(app) {
        let _ = snapshot.save(&p);
    }
}

fn set_status(app: &AppHandle, status: RuntimeStatus) {
    *app.state::<AppState>().status.lock().unwrap() = status.clone();
    let _ = app.emit("runtime-status", status);
}

/// Locates (or uses the given) Racket installation, installs the bridge and
/// starts the engine, on a background thread.
pub fn start_runtime(app: AppHandle, explicit: Option<PathBuf>) {
    set_status(&app, RuntimeStatus::default());
    std::thread::spawn(move || {
        let chosen = explicit.or_else(|| with_settings(&app, |s| s.racket_executable.clone()));
        let rt = match chosen {
            Some(exe) => match runtime::probe(&exe, "user") {
                Ok(rt) => Some(rt),
                Err(e) => {
                    set_status(&app, RuntimeStatus {
                        state: RuntimeState::Error,
                        runtime: None,
                        message: Some(e.to_string()),
                    });
                    return;
                }
            },
            None => {
                let found = runtime::discover();
                found.iter().find(|r| r.has_htdp).or(found.first()).cloned()
            }
        };
        let Some(rt) = rt else {
            set_status(&app, RuntimeStatus {
                state: RuntimeState::Missing,
                runtime: None,
                message: Some("Racket not found".into()),
            });
            return;
        };
        let cache = match app.path().app_local_data_dir() {
            Ok(d) => d,
            Err(e) => {
                set_status(&app, RuntimeStatus {
                    state: RuntimeState::Error,
                    runtime: Some(rt),
                    message: Some(e.to_string()),
                });
                return;
            }
        };
        let main = match bridge::install(&cache, &rt) {
            Ok(m) => m,
            Err(e) => {
                set_status(&app, RuntimeStatus {
                    state: RuntimeState::Error,
                    runtime: Some(rt),
                    message: Some(e.to_string()),
                });
                return;
            }
        };
        let emitter = app.clone();
        let engine = Arc::new(Engine::new(rt.clone(), main, Arc::new(move |ev| {
            let _ = emitter.emit("engine", ev);
        })));
        engine.prewarm();
        let old = app.state::<AppState>().engine.lock().unwrap().replace(engine);
        if let Some(old) = old {
            old.shutdown();
        }
        let message = (!rt.has_htdp).then(|| "htdp-lib not installed".to_owned());
        set_status(&app, RuntimeStatus { state: RuntimeState::Ready, runtime: Some(rt), message });
    });
}

pub fn shutdown(app: &AppHandle) {
    if let Some(engine) = app.state::<AppState>().engine.lock().unwrap().take() {
        engine.shutdown();
    }
}

fn engine(state: &State<AppState>) -> Result<Arc<Engine>, String> {
    state
        .engine
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Racket is not ready yet.".to_owned())
}

#[tauri::command]
pub fn runtime_status(state: State<AppState>) -> RuntimeStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
pub async fn runtime_discover() -> Vec<RuntimeInfo> {
    tauri::async_runtime::spawn_blocking(runtime::discover).await.unwrap_or_default()
}

#[tauri::command]
pub fn runtime_select(app: AppHandle, executable: Option<String>) {
    let exe = executable.map(PathBuf::from);
    with_settings(&app, |s| s.racket_executable = exe.clone());
    persist_settings(&app);
    start_runtime(app, exe);
}

#[tauri::command]
pub fn source_open(app: AppHandle, state: State<AppState>, path: String) -> Result<OpenedSource, String> {
    let path = PathBuf::from(path);
    let (opened, snap) = source::open(&path).map_err(|e| e.to_string())?;
    state.snapshots.lock().unwrap().insert(path.clone(), snap);
    with_settings(&app, |s| s.add_recent(&path));
    persist_settings(&app);
    Ok(opened)
}

#[tauri::command]
pub fn source_save(state: State<AppState>, path: String, text: String) -> Result<SaveOutcome, String> {
    let path = PathBuf::from(path);
    let mut snaps = state.snapshots.lock().unwrap();
    let (outcome, snap) = source::save(&path, snaps.get(&path), &text).map_err(|e| e.to_string())?;
    snaps.insert(path, snap);
    Ok(outcome)
}

#[tauri::command]
pub fn source_save_as(
    app: AppHandle,
    state: State<AppState>,
    from: Option<String>,
    path: String,
    text: String,
) -> Result<SaveOutcome, String> {
    let path = PathBuf::from(path);
    let mut snaps = state.snapshots.lock().unwrap();
    let original = from.as_ref().and_then(|f| snaps.get(Path::new(f)).cloned());
    let (outcome, snap) = source::save(&path, original.as_ref(), &text).map_err(|e| e.to_string())?;
    snaps.insert(path.clone(), snap);
    drop(snaps);
    with_settings(&app, |s| s.add_recent(&path));
    persist_settings(&app);
    Ok(outcome)
}

#[tauri::command]
pub fn source_close(state: State<AppState>, path: String) {
    state.snapshots.lock().unwrap().remove(Path::new(&path));
}

/// Runs the editor's current Definitions. The program text is exactly what
/// saving would write (same line endings), so the run matches the file.
#[tauri::command]
pub fn run_program(state: State<AppState>, path: Option<String>, text: String) -> Result<RunHandle, String> {
    let path = path.map(PathBuf::from);
    let snap = path.as_ref().and_then(|p| state.snapshots.lock().unwrap().get(p).cloned());
    let (bytes, _, _) = source::bytes_for_save(snap.as_ref(), &text);
    let body = bytes.strip_prefix(source::UTF8_BOM).unwrap_or(&bytes);
    let program = String::from_utf8(body.to_vec()).map_err(|e| e.to_string())?;
    engine(&state)?.run(path.as_deref(), &program).map_err(|e| e.to_string())
}

/// Starts the official HtDP stepper on the editor's current Definitions.
#[tauri::command]
pub fn step_program(state: State<AppState>, path: Option<String>, text: String) -> Result<RunHandle, String> {
    let path = path.map(PathBuf::from);
    let snap = path.as_ref().and_then(|p| state.snapshots.lock().unwrap().get(p).cloned());
    let (bytes, _, _) = source::bytes_for_save(snap.as_ref(), &text);
    let body = bytes.strip_prefix(source::UTF8_BOM).unwrap_or(&bytes);
    let program = String::from_utf8(body.to_vec()).map_err(|e| e.to_string())?;
    engine(&state)?.step(path.as_deref(), &program).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_stepper(state: State<AppState>) -> bool {
    engine(&state).map(|e| e.stop_stepper()).unwrap_or(false)
}

#[tauri::command]
pub fn eval_interaction(state: State<AppState>, text: String) -> Result<RunHandle, String> {
    engine(&state)?.eval(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_program(state: State<AppState>) -> bool {
    engine(&state).map(|e| e.stop()).unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    version: String,
    /// The official installer for this computer, if one is known.
    installer: Option<InstallerInfo>,
    default_dir: Option<PathBuf>,
    /// Windows asks for administrator permission once.
    needs_admin: bool,
}

/// What "Install Racket" would do on this computer.
#[tauri::command]
pub fn runtime_install_plan(version: Option<String>) -> InstallPlan {
    let version = version.unwrap_or_else(|| install::DEFAULT_VERSION.to_owned());
    InstallPlan {
        installer: install::installer_for(&version),
        default_dir: install::default_install_dir(&version),
        needs_admin: cfg!(windows),
        version,
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "kebab-case", rename_all_fields = "camelCase")]
enum InstallEvent {
    Progress { progress: InstallProgress },
    Done { executable: PathBuf },
    Failed { message: String },
}

/// Downloads, verifies and installs the official Racket, then uses it.
/// Progress is reported through `runtime-install` events.
#[tauri::command]
pub fn runtime_install(app: AppHandle, version: String, dest: String) {
    std::thread::spawn(move || {
        let emit = |e: InstallEvent| {
            let _ = app.emit("runtime-install", e);
        };
        let downloads = match app.path().app_cache_dir() {
            Ok(d) => d.join("downloads"),
            Err(e) => return emit(InstallEvent::Failed { message: e.to_string() }),
        };
        let dest = PathBuf::from(dest);
        let progress = |p: InstallProgress| {
            let _ = app.emit("runtime-install", InstallEvent::Progress { progress: p });
        };
        match install::install(&version, &dest, &downloads, &progress) {
            Ok(rt) => {
                with_settings(&app, |s| s.racket_executable = Some(rt.executable.clone()));
                persist_settings(&app);
                emit(InstallEvent::Done { executable: rt.executable.clone() });
                start_runtime(app.clone(), Some(rt.executable));
            }
            Err(e) => emit(InstallEvent::Failed { message: e.to_string() }),
        }
    });
}

/// Published announcements (display-only), see announcements/README.md.
const ANNOUNCEMENTS_URL: &str =
    "https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/announcements/current.json";

/// Downloads the announcements file. Returns its text (at most 64 KB); the
/// frontend validates it. Failures are reported to the caller, which ignores
/// them quietly.
#[tauri::command]
pub async fn announcements_fetch() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use std::io::Read;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(8)))
            .build()
            .into();
        let response = agent.get(ANNOUNCEMENTS_URL).call().map_err(|e| e.to_string())?;
        let mut text = String::new();
        response
            .into_body()
            .into_reader()
            .take(64 * 1024)
            .read_to_string(&mut text)
            .map_err(|e| e.to_string())?;
        Ok(text)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Lists one folder for the Explorer (read-only).
#[tauri::command]
pub fn workspace_list(path: String) -> Result<Vec<DirEntry>, String> {
    workspace::list_dir(Path::new(&path)).map_err(|e| e.to_string())
}

/// Files under a folder, recursively (read-only), for Quick Open.
#[tauri::command]
pub async fn workspace_files(path: String) -> Result<Vec<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || workspace::list_files(Path::new(&path), 10_000).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Find in Files (read-only).
#[tauri::command]
pub async fn workspace_search(path: String, query: String, case_sensitive: bool) -> Result<Vec<workspace::SearchMatch>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workspace::search(Path::new(&path), &query, case_sensitive, 2_000).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Remembers the folder open in the Explorer (`None` closes it).
#[tauri::command]
pub fn workspace_set_folder(app: AppHandle, path: Option<String>) {
    with_settings(&app, |s| s.workspace_folder = path.map(PathBuf::from));
    persist_settings(&app);
}

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Settings {
    with_settings(&app, |s| s.clone())
}

#[tauri::command]
pub fn settings_set_ui(app: AppHandle, ui: serde_json::Value) {
    with_settings(&app, |s| s.ui = ui);
    persist_settings(&app);
}

/// Checks an SSH compute host and returns its Racket version.
#[tauri::command]
pub async fn remote_probe(host: String, racket: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || remote::probe(&host, &racket).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Runs a program on an SSH compute host as a task. Output and the exit
/// arrive as `compute-task` events.
#[tauri::command]
pub fn remote_run(app: AppHandle, state: State<AppState>, host: String, racket: String, file_name: String, text: String) -> Result<u64, String> {
    let id = {
        let mut n = state.next_task.lock().unwrap();
        *n += 1;
        *n
    };
    let emitter = app.clone();
    let sink: remote::TaskSink = Arc::new(move |e| {
        if let remote::TaskEvent::Exit { task, .. } = &e {
            emitter.state::<AppState>().remote_tasks.lock().unwrap().remove(task);
        }
        let _ = emitter.emit("compute-task", e);
    });
    let task = remote::run(id, &host, &racket, &file_name, &text, sink).map_err(|e| e.to_string())?;
    state.remote_tasks.lock().unwrap().insert(id, task);
    Ok(id)
}

#[tauri::command]
pub fn remote_cancel(state: State<AppState>, task: u64) -> bool {
    match state.remote_tasks.lock().unwrap().get(&task) {
        Some(t) => {
            t.cancel();
            true
        }
        None => false,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    os: &'static str,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo { name: "PhDRacket", version: env!("CARGO_PKG_VERSION"), os: std::env::consts::OS }
}
