use serde::Serialize;

use super::model::TerminalProfile;
use super::store::ProfilesFile;
use super::validate::{validate_profiles, ProfileError};

/// Why a profile command did nothing; the UI shows `Invalid` errors next to their fields.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProfilesCommandError {
    Invalid { errors: Vec<ProfileError> },
    NotFound { id: String },
    Io { message: String },
}

/// Replaces the profile with the same id in place, or appends it. Leaves `file` untouched when
/// the resulting list does not validate.
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

/// Deletes a profile; when it was the default, the first remaining profile becomes the default.
pub fn remove(file: &mut ProfilesFile, id: &str) -> Result<(), ProfilesCommandError> {
    let index = position(file, id)?;
    file.profiles.remove(index);
    if file.default_profile_id.as_deref() == Some(id) {
        file.default_profile_id = file.profiles.first().map(|p| p.id.clone());
    }
    Ok(())
}

pub fn set_default(file: &mut ProfilesFile, id: &str) -> Result<(), ProfilesCommandError> {
    position(file, id)?;
    file.default_profile_id = Some(id.to_string());
    Ok(())
}

fn position(file: &ProfilesFile, id: &str) -> Result<usize, ProfilesCommandError> {
    file.profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| ProfilesCommandError::NotFound { id: id.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::profiles::store;

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
        }
    }

    fn ids(file: &ProfilesFile) -> Vec<&str> {
        file.profiles.iter().map(|p| p.id.as_str()).collect()
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
    fn deleting_the_default_makes_the_first_remaining_profile_the_default() {
        let mut f = file(&["a", "b", "c"], Some("b"));
        remove(&mut f, "b").unwrap();
        assert_eq!(ids(&f), ["a", "c"]);
        assert_eq!(f.default_profile_id.as_deref(), Some("a"));
    }

    #[test]
    fn deleting_the_only_profile_clears_the_default() {
        let mut f = file(&["a"], Some("a"));
        remove(&mut f, "a").unwrap();
        assert_eq!(f, ProfilesFile::default());
    }

    #[test]
    fn deleting_another_profile_keeps_the_default() {
        let mut f = file(&["a", "b"], Some("b"));
        remove(&mut f, "a").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("b"));
    }

    #[test]
    fn unknown_ids_are_not_found() {
        let mut f = file(&["a"], Some("a"));
        let not_found = ProfilesCommandError::NotFound { id: "x".into() };
        assert_eq!(remove(&mut f, "x"), Err(not_found.clone()));
        assert_eq!(set_default(&mut f, "x"), Err(not_found));
        assert_eq!(f, file(&["a"], Some("a")));
    }

    #[test]
    fn set_default_picks_an_existing_profile() {
        let mut f = file(&["a", "b"], Some("a"));
        set_default(&mut f, "b").unwrap();
        assert_eq!(f.default_profile_id.as_deref(), Some("b"));
    }

    #[test]
    fn mutations_persist_through_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let mut f = ProfilesFile::default();
        upsert(&mut f, profile("a", "a")).unwrap();
        upsert(&mut f, profile("b", "b")).unwrap();
        set_default(&mut f, "b").unwrap();
        store::save(dir.path(), &f).unwrap();
        let loaded = store::load(dir.path());
        assert_eq!(loaded.recovered, None);
        assert_eq!(loaded.file, f);
    }
}
