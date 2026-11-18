//! Terminal profiles (E14): named launch settings the backend owns and validates.
//!
//! The UI refers to a profile by id and the backend resolves it (decision 10). This module holds
//! the model and its validation; storage, commands, detection and launch build on it.

mod model;
mod validate;

pub use model::{
    CloseBehavior, CursorStyle, ProfileAppearance, ProfileEnvironment, ProfileTab, TerminalProfile,
};
pub use validate::{validate_profile, validate_profiles, ProfileError, ProfileErrorCode};
