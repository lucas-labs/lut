use std::sync::MutexGuard;

use tauri::{AppHandle, Emitter, State};

use super::model::TerminalProfile;
use super::ops::{self, ProfilesCommandError};
use super::store::{self, ProfilesFile, ProfilesState};

/// Emitted after every mutation that reached the disk; listeners read the profiles again.
pub const PROFILES_CHANGED_EVENT: &str = "lut:profiles-changed";

fn lock(state: &ProfilesState) -> MutexGuard<'_, ProfilesFile> {
    state
        .file
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The result of a mutation, and whether the stored profiles changed (so the UI must be told).
struct Applied {
    result: Result<(), ProfilesCommandError>,
    changed: bool,
}

/// Applies `op` to a copy, writes it to disk, then swaps it in. The lock is held across the write
/// so two mutations never interleave. Memory follows the disk: it stays as it was when the file
/// was not replaced, and takes the new profiles when it was, even if making that durable failed.
fn apply(
    state: &ProfilesState,
    op: impl FnOnce(&mut ProfilesFile) -> Result<(), ProfilesCommandError>,
) -> Applied {
    let unchanged = |result| Applied {
        result,
        changed: false,
    };
    if let Some(reason) = state.writes_blocked() {
        return unchanged(Err(ProfilesCommandError::Io {
            message: reason.to_string(),
        }));
    }
    let mut current = lock(state);
    let mut next = current.clone();
    if let Err(error) = op(&mut next) {
        return unchanged(Err(error));
    }
    let result = match store::save(&state.dir, &next) {
        Ok(()) => Ok(()),
        Err(error) if error.committed => Err(ProfilesCommandError::Io {
            message: error.to_string(),
        }),
        Err(error) => {
            return unchanged(Err(ProfilesCommandError::Io {
                message: error.to_string(),
            }))
        }
    };
    *current = next;
    Applied {
        result,
        changed: true,
    }
}

fn mutate(
    app: &AppHandle,
    state: &ProfilesState,
    op: impl FnOnce(&mut ProfilesFile) -> Result<(), ProfilesCommandError>,
) -> Result<(), ProfilesCommandError> {
    let applied = apply(state, op);
    if applied.changed {
        let _ = app.emit(PROFILES_CHANGED_EVENT, ());
    }
    applied.result
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::profiles::store::PROFILES_FILE;

    fn profile(id: &str) -> TerminalProfile {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": id, "executable": "pwsh.exe"
        }))
        .unwrap()
    }

    #[test]
    fn a_save_reaches_disk_and_memory() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        let applied = apply(&state, |file| ops::upsert(file, profile("a")));
        assert_eq!(applied.result, Ok(()));
        assert!(applied.changed);
        assert_eq!(lock(&state).profiles, vec![profile("a")]);
        assert_eq!(store::load(dir.path()).file.profiles, vec![profile("a")]);
    }

    #[test]
    fn a_rejected_change_touches_neither_disk_nor_memory() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        let applied = apply(&state, |file| ops::set_default(file, "missing"));
        assert!(matches!(
            applied.result,
            Err(ProfilesCommandError::NotFound { .. })
        ));
        assert!(!applied.changed);
        assert!(!dir.path().join(PROFILES_FILE).exists());
    }

    #[test]
    fn a_store_left_in_place_at_startup_blocks_writes() {
        let dir = tempfile::tempdir().unwrap();
        // A directory where the file should be: reading it fails, so load leaves it in place.
        let unreadable = dir.path().join(PROFILES_FILE);
        std::fs::create_dir(&unreadable).unwrap();
        std::fs::write(unreadable.join("keep"), "original").unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        assert!(state.writes_blocked().is_some());

        let applied = apply(&state, |file| ops::upsert(file, profile("a")));
        assert!(matches!(
            applied.result,
            Err(ProfilesCommandError::Io { .. })
        ));
        assert!(!applied.changed);
        assert!(lock(&state).profiles.is_empty());
        assert_eq!(
            std::fs::read_to_string(unreadable.join("keep")).unwrap(),
            "original"
        );
    }

    #[test]
    fn a_store_backed_up_at_startup_still_accepts_writes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(PROFILES_FILE), "{ not json").unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        assert_eq!(state.writes_blocked(), None);
        let applied = apply(&state, |file| ops::upsert(file, profile("a")));
        assert_eq!(applied.result, Ok(()));
    }
}
