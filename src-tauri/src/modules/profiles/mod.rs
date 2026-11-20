//! Terminal profiles (E14): named launch settings the backend owns and validates.
//!
//! The UI refers to a profile by id and the backend resolves it (decision 10). This module holds
//! the model, its validation, its store and the commands that edit it; detection and launch build
//! on it.

pub mod commands;
mod model;
pub mod ops;
pub mod store;
mod validate;

pub use model::{
    CloseBehavior, CursorStyle, ProfileAppearance, ProfileEnvironment, ProfileTab, TerminalProfile,
};
pub use validate::{validate_profile, validate_profiles, ProfileError, ProfileErrorCode};
