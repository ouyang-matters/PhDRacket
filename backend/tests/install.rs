//! Installs the official Racket into a temporary folder: downloads about
//! 250 MB, so it is ignored by default.
//!
//!   cargo test -p phdracket-core --test install -- --ignored

use phdracket_core::install;

#[test]
#[ignore]
fn installs_official_racket_into_a_user_folder() {
    if cfg!(windows) {
        eprintln!("skipped on Windows: the official installer needs an administrator prompt");
        return;
    }
    let root = std::env::temp_dir().join(format!("phdracket-install-{}", std::process::id()));
    let dest = root.join("racket-9.3");
    let phases = std::sync::Mutex::new(Vec::new());
    let rt = install::install(install::DEFAULT_VERSION, &dest, &root.join("downloads"), &|p| {
        phases.lock().unwrap().push(format!("{p:?}"));
    })
    .expect("install succeeds");
    assert_eq!(rt.version, "9.3");
    assert!(rt.has_htdp);
    let phases = phases.into_inner().unwrap();
    assert!(phases.iter().any(|p| p.starts_with("Verifying")));
    assert!(!root.join("downloads").join(install::installer_for("9.3").unwrap().file).exists(), "installer removed");
    std::fs::remove_dir_all(&root).unwrap();
}
