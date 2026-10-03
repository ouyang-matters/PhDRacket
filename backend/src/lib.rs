//! PhDRacket backend core.
//!
//! This crate contains no UI and no Racket semantics. It finds official
//! Racket installations, manages the bridge processes that run student code
//! inside them, and reads/writes source files without altering them.

pub mod bridge;
pub mod engine;
pub mod install;
pub mod language;
pub mod protocol;
pub mod remote;
pub mod runtime;
pub mod settings;
pub mod source;
pub mod workspace;
