use serde::Serialize;

use super::detect::{self, is_detected_id};
use super::model::{DetectedOverride, TerminalProfile};
use super::store::ProfilesFile;
use super::validate::{validate_profiles, ProfileError};

/// Why a profile command did nothing; the UI shows `Invalid` errors next to their fields.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProfilesCommandError {
    Invalid {
        errors: Vec<ProfileError>,
    },
    NotFound {
        id: String,
    },
    /// A detected profile: it can be hidden or restyled, not edited or deleted.
    ReadOnly {
        id: String,
    },
    Io {
        message: String,
    },
}

/// Replaces the user's profile with the same id in place, or appends it. Leaves `file` untouched
/// when the resulting list does not validate (a `detected:` id included).
pub fn upsert(
    file: &mut ProfilesFile,
    profile: TerminalProfile,
) -> Result<(), ProfilesCommandError> {
    let mut profiles = file.profiles.clone();
    match profiles.iter_mut().find(|p| p.id == profile.id) {
        Some(existing) => *existing = profile,
        None => profiles.push(profile),
    }
    let errors = validate_profiles(&profiles);
    if !errors.is_empty() {
        return Err(ProfilesCommandError::Invalid { errors });
    }
    file.profiles = profiles;
    Ok(())
}

/// Deletes one of the user's profiles. When it was the default, the first profile still listed
/// and not hidden (detected ones come first) becomes the default.
pub fn remove(
    file: &mut ProfilesFile,
    detected: &[TerminalProfile],
    id: &str,
) -> Result<(), ProfilesCommandError> {
    if is_detected_id(id) {
        return Err(ProfilesCommandError::ReadOnly { id: id.to_string() });
    }
    let index = position(file, id)?;
    file.profiles.remove(index);
    if file.default_profile_id.as_deref() == Some(id) {
        file.default_profile_id = detect::entries(file, detected)
            .into_iter()
            .find(|entry| !entry.hidden)
            .map(|entry| entry.profile.id);
    }
    Ok(())
}

/// Makes a listed profile, detected or the user's own, the default.
pub fn set_default(
    file: &mut ProfilesFile,
    detected: &[TerminalProfile],
    id: &str,
) -> Result<(), ProfilesCommandError> {
    let listed = detected.iter().any(|p| p.id == id) || position(file, id).is_ok();
    if !listed {
        return Err(not_found(id));
    }
    file.default_profile_id = Some(id.to_string());
    Ok(())
}

/// Stores the user's changes to a detected profile; no changes at all drop its entry.
pub fn set_detected_override(
    file: &mut ProfilesFile,
    detected: &[TerminalProfile],
    id: &str,
    changes: DetectedOverride,
) -> Result<(), ProfilesCommandError> {
    if !detected.iter().any(|p| p.id == id) {
        return Err(not_found(id));
    }
    if changes == DetectedOverride::default() {
        file.detected.remove(id);
    } else {
        file.detected.insert(id.to_string(), changes);
    }
    Ok(())
}

fn position(file: &ProfilesFile, id: &str) -> Result<usize, ProfilesCommandError> {
    file.profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| not_found(id))
}

fn not_found(id: &str) -> ProfilesCommandError {
    ProfilesCommandError::NotFound { id: id.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::profiles::store;
    use crate::modules::profiles::validate::ProfileErrorCode;

    fn profile(id: &str, name: &str) -> TerminalProfile {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": name, "executable": "pwsh.exe"
        }))
        .unwrap()
    }

    fn file(ids: &[&str], default: Option<&str>) -> ProfilesFile {
        ProfilesFile {
            profiles: ids.iter().map(|id| profile(id, id)).collect(),
            default_profile_id: default.map(str::to_string),
            ..Default::default()
        }
    }

    fn ids(file: &ProfilesFile) -> Vec<&str> {
        file.profiles.iter().map(|p| p.id.as_str()).collect()
    }

    /// Two detected shells, as detection would list them.
    fn detected() -> Vec<TerminalProfile> {
        vec![
            profile("detected:pwsh", "PowerShell"),
            profile("detected:cmd", "Command Prompt"),
        ]
    }

    fn hidden() -> DetectedOverride {
        DetectedOverride {
            hidden: true,
            ..Default::default()
        }
    }

    #[test]
    fn upsert_appends_a_new_profile_and_replaces_an_existing_one_in_place() {
        let mut f = file(&["a", "b"], None);
        upsert(&mut f, profile("c", "c")).unwrap();
        upsert(&mut f, profile("a", "renamed")).unwrap();
        assert_eq!(ids(&f), ["a", "b", "c"]);
        assert_eq!(f.profiles[0].name, "renamed");
    }

    #[test]
    fn an_invalid_profile_is_rejected_without_changes() {
        let mut f = file(&["a"], Some("a"));
        let before = f.clone();
        let error = upsert(&mut f, profile("b", " ")).unwrap_err();
        let ProfilesCommandError::Invalid { errors } = error else {
            panic!("expected Invalid, got {error:?}");
        };
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "name");
        assert_eq!(f, before);
    }

    #[test]
    fn a_detected_profile_cannot_be_saved_as_the_users_own() {
        let mut f = file(&[], None);
        let error = upsert(&mut f, profile("detected:pwsh", "Mine")).unwrap_err();
        let ProfilesCommandError::Invalid { errors } = error else {
            panic!("expected Invalid, got {error:?}");
        };
        assert_eq!(errors[0].code, ProfileErrorCode::ReservedId);
        assert!(f.profiles.is_empty());
    }

    #[test]
    fn deleting_the_default_makes_the_first_listed_profile_the_default() {
        let mut f = file(&["a", "b", "c"], Some("b"));
        remove(&mut f, &detected(), "b").unwrap();
        assert_eq!(ids(&f), ["a", "c"]);
        assert_eq!(f.default_profile_id.as_deref(), Some("detected:pwsh"));
    }

    #[test]
    fn hidden_profiles_do_not_become_the_default() {
        let mut f = file(&["a", "b"], Some("a"));
        f.detected.insert("detected:pwsh".into(), hidden());
        f.detected.insert("detected:cmd".into(), hidden());
        remove(&mut f, &detected(), "a").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("b"));
    }

    #[test]
    fn deleting_the_last_profile_without_detected_ones_clears_the_default() {
        let mut f = file(&["a"], Some("a"));
        remove(&mut f, &[], "a").unwrap();
        assert_eq!(f, ProfilesFile::default());
    }

    #[test]
    fn deleting_another_profile_keeps_the_default() {
        let mut f = file(&["a", "b"], Some("b"));
        remove(&mut f, &detected(), "a").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("b"));
    }

    #[test]
    fn detected_profiles_cannot_be_deleted() {
        let mut f = file(&["a"], Some("detected:pwsh"));
        let before = f.clone();
        assert_eq!(
            remove(&mut f, &detected(), "detected:pwsh"),
            Err(ProfilesCommandError::ReadOnly {
                id: "detected:pwsh".into()
            })
        );
        assert_eq!(f, before);
    }

    #[test]
    fn unknown_ids_are_not_found() {
        let mut f = file(&["a"], Some("a"));
        let not_found = ProfilesCommandError::NotFound { id: "x".into() };
        assert_eq!(remove(&mut f, &detected(), "x"), Err(not_found.clone()));
        assert_eq!(set_default(&mut f, &detected(), "x"), Err(not_found));
        assert_eq!(
            set_detected_override(&mut f, &detected(), "detected:wsl:Gone", hidden()),
            Err(ProfilesCommandError::NotFound {
                id: "detected:wsl:Gone".into()
            })
        );
        assert_eq!(f, file(&["a"], Some("a")));
    }

    #[test]
    fn set_default_picks_a_custom_or_a_detected_profile() {
        let mut f = file(&["a", "b"], Some("a"));
        set_default(&mut f, &detected(), "b").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("b"));
        set_default(&mut f, &detected(), "detected:cmd").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("detected:cmd"));
    }

    #[test]
    fn detected_overrides_are_stored_and_dropped_when_empty() {
        let mut f = file(&[], None);
        set_detected_override(&mut f, &detected(), "detected:cmd", hidden()).unwrap();
        assert_eq!(f.detected.get("detected:cmd"), Some(&hidden()));
        set_detected_override(
            &mut f,
            &detected(),
            "detected:cmd",
            DetectedOverride::default(),
        )
        .unwrap();
        assert!(f.detected.is_empty());
    }

    #[test]
    fn mutations_persist_through_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let mut f = ProfilesFile::default();
        upsert(&mut f, profile("a", "a")).unwrap();
        upsert(&mut f, profile("b", "b")).unwrap();
        set_default(&mut f, &detected(), "b").unwrap();
        set_detected_override(&mut f, &detected(), "detected:pwsh", hidden()).unwrap();
        store::save(dir.path(), &f).unwrap();
        let loaded = store::load(dir.path());
        assert_eq!(loaded.recovered, None);
        assert_eq!(loaded.file, f);
    }
}
