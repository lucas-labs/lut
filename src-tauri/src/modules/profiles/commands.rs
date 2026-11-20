use std::sync::MutexGuard;

use tauri::{AppHandle, Emitter, State};

use super::model::TerminalProfile;
use super::ops::{self, ProfilesCommandError};
use super::store::{self, ProfilesFile, ProfilesState};

/// Emitted after every successful mutation; listeners read the profiles again.
pub const PROFILES_CHANGED_EVENT: &str = "lut:profiles-changed";

fn lock(state: &ProfilesState) -> MutexGuard<'_, ProfilesFile> {
    state
        .file
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Applies `op` to a copy, writes it to disk, then swaps it in and notifies the UI. The lock is
/// held across the write so two mutations never interleave; a failure leaves memory unchanged.
fn mutate(
    app: &AppHandle,
    state: &ProfilesState,
    op: impl FnOnce(&mut ProfilesFile) -> Result<(), ProfilesCommandError>,
) -> Result<(), ProfilesCommandError> {
    let mut current = lock(state);
    let mut next = current.clone();
    op(&mut next)?;
    store::save(&state.dir, &next).map_err(|error| ProfilesCommandError::Io {
        message: error.to_string(),
    })?;
    *current = next;
    drop(current);
    let _ = app.emit(PROFILES_CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn profiles_list(state: State<'_, ProfilesState>) -> ProfilesFile {
    lock(&state).clone()
}

#[tauri::command]
pub fn profiles_get(state: State<'_, ProfilesState>, id: String) -> Option<TerminalProfile> {
    lock(&state).profiles.iter().find(|p| p.id == id).cloned()
}

#[tauri::command]
pub fn profiles_save(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    profile: TerminalProfile,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file| ops::upsert(file, profile))
}

#[tauri::command]
pub fn profiles_delete(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    id: String,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file| ops::remove(file, &id))
}

#[tauri::command]
pub fn profiles_set_default(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    id: String,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file| ops::set_default(file, &id))
}
