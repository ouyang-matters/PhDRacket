//! Application-level settings, stored in the per-user config directory.
//! Nothing here is ever written into a source file or a project folder.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const MAX_RECENT: usize = 15;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// The Racket executable the user chose; `None` means auto-detect.
    pub racket_executable: Option<PathBuf>,
    pub recent_files: Vec<PathBuf>,
    /// Editor and UI preferences, owned by the frontend.
    pub ui: serde_json::Value,
}

impl Settings {
    pub fn load(path: &Path) -> Settings {
        fs::read(path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let bytes = serde_json::to_vec_pretty(self).expect("settings serialize");
        crate::source::write_atomically(path, &bytes).map_err(std::io::Error::other)
    }

    pub fn add_recent(&mut self, file: &Path) {
        self.recent_files.retain(|p| p != file);
        self.recent_files.insert(0, file.to_owned());
        self.recent_files.truncate(MAX_RECENT);
    }
}
