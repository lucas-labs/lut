use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::detect::{self, ProfileEntry};
use super::launch::{self, ProfileLaunch};
use super::model::{DetectedOverride, TerminalProfile};
use super::ops::{self, ProfilesCommandError};
use super::store::{self, ProfilesFile, ProfilesState};
use crate::modules::pty::shell_init::LaunchError;

/// Emitted after every change to the listed profiles (a mutation that reached the disk, or a
/// detection that found something different); listeners read the profiles again.
pub const PROFILES_CHANGED_EVENT: &str = "lut:profiles-changed";

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn detected(state: &ProfilesState) -> Vec<TerminalProfile> {
    lock(&state.detected).clone()
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
    op: impl FnOnce(&mut ProfilesFile, &[TerminalProfile]) -> Result<(), ProfilesCommandError>,
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
    let mut current = lock(&state.file);
    let mut next = current.clone();
    if let Err(error) = op(&mut next, &detected(state)) {
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
    op: impl FnOnce(&mut ProfilesFile, &[TerminalProfile]) -> Result<(), ProfilesCommandError>,
) -> Result<(), ProfilesCommandError> {
    let applied = apply(state, op);
    if applied.changed {
        let _ = app.emit(PROFILES_CHANGED_EVENT, ());
    }
    applied.result
}

/// Every profile the UI can offer, detected ones first, and the one a new terminal opens with.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesList {
    pub profiles: Vec<ProfileEntry>,
    /// The stored default while it is listed, else the first profile not hidden.
    pub default_profile_id: Option<String>,
}

fn list(state: &ProfilesState) -> ProfilesList {
    let file = lock(&state.file);
    let profiles = detect::entries(&file, &detected(state));
    let default_profile_id =
        launch::effective_default(&profiles, file.default_profile_id.as_deref())
            .map(|entry| entry.profile.id.clone());
    ProfilesList {
        profiles,
        default_profile_id,
    }
}

/// How long a terminal opened at startup waits for the first detection, which only checks files
/// and the registry: a hung `git --exec-path` is the one thing that could make it slow.
const DETECTION_WAIT: Duration = Duration::from_secs(5);

/// The launch for the profile `requested`, or for the default one when `None`. Blocking: at
/// startup it waits for the first detection, so a detected profile is never reported missing.
pub fn resolve_launch(
    state: &ProfilesState,
    requested: Option<&str>,
    pane_cwd: Option<String>,
) -> Result<ProfileLaunch, LaunchError> {
    if !state.wait_for_detection(DETECTION_WAIT) {
        log::warn!("profile detection still running; opening with the profiles found so far");
    }
    let file = lock(&state.file);
    let entries = detect::entries(&file, &detected(state));
    let profile = launch::pick(&entries, file.default_profile_id.as_deref(), requested)?;
    Ok(launch::profile_launch(profile, pane_cwd))
}

/// Detects the shells and distros again and swaps the list in; `true` when it changed.
/// Blocking: run it off the main thread.
fn redetect(state: &ProfilesState) -> bool {
    let _detecting = lock(&state.detecting);
    let found = detect::detect();
    let changed = {
        let mut current = lock(&state.detected);
        let changed = *current != found;
        *current = found;
        changed
    };
    state.detection_finished();
    changed
}

/// The startup detection, off the main thread: finding Git Bash may run `git`.
pub fn detect_in_background(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if redetect(&app.state::<ProfilesState>()) {
            let _ = app.emit(PROFILES_CHANGED_EVENT, ());
        }
    });
}

#[tauri::command]
pub fn profiles_list(state: State<'_, ProfilesState>) -> ProfilesList {
    list(&state)
}

#[tauri::command]
pub fn profiles_get(state: State<'_, ProfilesState>, id: String) -> Option<ProfileEntry> {
    list(&state)
        .profiles
        .into_iter()
        .find(|entry| entry.profile.id == id)
}

#[tauri::command]
pub fn profiles_save(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    profile: TerminalProfile,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file, _| ops::upsert(file, profile))
}

#[tauri::command]
pub fn profiles_delete(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    id: String,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file, detected| {
        ops::remove(file, detected, &id)
    })
}

#[tauri::command]
pub fn profiles_set_default(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    id: String,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file, detected| {
        ops::set_default(file, detected, &id)
    })
}

/// Hides a detected profile or changes its look; the profile itself stays read-only.
#[tauri::command]
pub fn profiles_set_detected_override(
    app: AppHandle,
    state: State<'_, ProfilesState>,
    id: String,
    changes: DetectedOverride,
) -> Result<(), ProfilesCommandError> {
    mutate(&app, &state, |file, detected| {
        ops::set_detected_override(file, detected, &id, changes)
    })
}

/// Detects the shells and distros again, for when the user installed or removed one.
#[tauri::command]
pub async fn profiles_detect(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let changed =
        tauri::async_runtime::spawn_blocking(move || redetect(&handle.state::<ProfilesState>()))
            .await
            .map_err(|error| error.to_string())?;
    if changed {
        let _ = app.emit(PROFILES_CHANGED_EVENT, ());
    }
    Ok(())
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
        let applied = apply(&state, |file, _| ops::upsert(file, profile("a")));
        assert_eq!(applied.result, Ok(()));
        assert!(applied.changed);
        assert_eq!(lock(&state.file).profiles, vec![profile("a")]);
        assert_eq!(store::load(dir.path()).file.profiles, vec![profile("a")]);
    }

    #[test]
    fn a_rejected_change_touches_neither_disk_nor_memory() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        let applied = apply(&state, |file, detected| {
            ops::set_default(file, detected, "missing")
        });
        assert!(matches!(
            applied.result,
            Err(ProfilesCommandError::NotFound { .. })
        ));
        assert!(!applied.changed);
        assert!(!dir.path().join(PROFILES_FILE).exists());
    }

    #[test]
    fn mutations_see_the_detected_profiles() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        *lock(&state.detected) = vec![profile("detected:pwsh")];
        let applied = apply(&state, |file, detected| {
            ops::set_default(file, detected, "detected:pwsh")
        });
        assert_eq!(applied.result, Ok(()));
        let listed = list(&state);
        assert_eq!(listed.default_profile_id.as_deref(), Some("detected:pwsh"));
        assert_eq!(listed.profiles[0].profile.id, "detected:pwsh");
    }

    #[test]
    fn the_listed_default_is_the_one_a_terminal_opens() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        *lock(&state.detected) = vec![profile("detected:pwsh"), profile("detected:cmd")];
        assert_eq!(
            list(&state).default_profile_id.as_deref(),
            Some("detected:pwsh")
        );
        lock(&state.file).default_profile_id = Some("detected:git-bash".into());
        assert_eq!(
            list(&state).default_profile_id.as_deref(),
            Some("detected:pwsh")
        );
        lock(&state.file).default_profile_id = Some("detected:cmd".into());
        assert_eq!(
            list(&state).default_profile_id.as_deref(),
            Some("detected:cmd")
        );
    }

    #[test]
    fn a_launch_resolves_after_detection_by_id_or_default() {
        let dir = tempfile::tempdir().unwrap();
        let state = ProfilesState::load(dir.path().to_path_buf());
        *lock(&state.detected) = vec![profile("detected:pwsh")];
        state.detection_finished();
        lock(&state.file).profiles.push(TerminalProfile {
            executable: Some("nu.exe".into()),
            ..profile("mine")
        });
        let program = |requested: Option<&str>| {
            resolve_launch(&state, requested, None).map(|launch| launch.spec.program)
        };
        assert_eq!(program(Some("mine")), Ok(Some("nu.exe".into())));
        assert_eq!(program(None), Ok(Some("pwsh.exe".into())));
        assert_eq!(
            program(Some("gone")),
            Err(LaunchError::ProfileNotFound { id: "gone".into() })
        );
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

        let applied = apply(&state, |file, _| ops::upsert(file, profile("a")));
        assert!(matches!(
            applied.result,
            Err(ProfilesCommandError::Io { .. })
        ));
        assert!(!applied.changed);
        assert!(lock(&state.file).profiles.is_empty());
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
        let applied = apply(&state, |file, _| ops::upsert(file, profile("a")));
        assert_eq!(applied.result, Ok(()));
    }
}
