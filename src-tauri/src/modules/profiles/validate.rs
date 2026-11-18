use std::collections::HashSet;
use std::fmt::{Display, Formatter};

use serde::Serialize;

use super::model::TerminalProfile;

/// One problem with one field of a profile, for the UI to mark next to that field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileError {
    pub profile_id: String,
    /// camelCase path of the field: `name`, `executable`, `id`, or `env.<NAME>`.
    pub field: String,
    pub code: ProfileErrorCode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileErrorCode {
    EmptyId,
    EmptyName,
    EmptyExecutable,
    /// Empty, or holding `=` or NUL, which break the environment block on every platform.
    InvalidEnvName,
    DuplicateId,
}

impl ProfileError {
    fn new(profile: &TerminalProfile, field: impl Into<String>, code: ProfileErrorCode) -> Self {
        Self {
            profile_id: profile.id.clone(),
            field: field.into(),
            code,
        }
    }
}

impl Display for ProfileError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let problem = match self.code {
            ProfileErrorCode::EmptyId => "id is empty",
            ProfileErrorCode::EmptyName => "name is empty",
            ProfileErrorCode::EmptyExecutable => "executable is empty",
            ProfileErrorCode::InvalidEnvName => "environment variable name is invalid",
            ProfileErrorCode::DuplicateId => "id is used by another profile",
        };
        write!(
            f,
            "profile {:?}: {} ({})",
            self.profile_id, problem, self.field
        )
    }
}

impl std::error::Error for ProfileError {}

fn is_blank(value: &str) -> bool {
    value.trim().is_empty()
}

fn is_valid_env_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['=', '\0'])
}

/// Every problem in one profile, not only the first.
pub fn validate_profile(profile: &TerminalProfile) -> Vec<ProfileError> {
    let mut errors = Vec::new();
    if is_blank(&profile.id) {
        errors.push(ProfileError::new(profile, "id", ProfileErrorCode::EmptyId));
    }
    if is_blank(&profile.name) {
        errors.push(ProfileError::new(
            profile,
            "name",
            ProfileErrorCode::EmptyName,
        ));
    }
    if is_blank(&profile.executable) {
        errors.push(ProfileError::new(
            profile,
            "executable",
            ProfileErrorCode::EmptyExecutable,
        ));
    }
    for name in profile.env.keys() {
        if !is_valid_env_name(name) {
            errors.push(ProfileError::new(
                profile,
                format!("env.{name}"),
                ProfileErrorCode::InvalidEnvName,
            ));
        }
    }
    errors
}

/// Every problem in a set of profiles: each profile's own, plus each repeat of an id already used.
pub fn validate_profiles(profiles: &[TerminalProfile]) -> Vec<ProfileError> {
    let mut errors = Vec::new();
    let mut seen = HashSet::new();
    for profile in profiles {
        errors.extend(validate_profile(profile));
        if !is_blank(&profile.id) && !seen.insert(profile.id.as_str()) {
            errors.push(ProfileError::new(
                profile,
                "id",
                ProfileErrorCode::DuplicateId,
            ));
        }
    }
    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn profile(id: &str) -> TerminalProfile {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "name": "PowerShell",
            "executable": "pwsh.exe"
        }))
        .unwrap()
    }

    fn codes(errors: &[ProfileError]) -> Vec<(&str, ProfileErrorCode)> {
        errors.iter().map(|e| (e.field.as_str(), e.code)).collect()
    }

    #[test]
    fn a_valid_profile_has_no_errors() {
        assert!(validate_profile(&profile("pwsh")).is_empty());
    }

    #[test]
    fn rejects_an_empty_or_blank_name() {
        for name in ["", "   "] {
            let mut p = profile("pwsh");
            p.name = name.into();
            assert_eq!(
                codes(&validate_profile(&p)),
                [("name", ProfileErrorCode::EmptyName)]
            );
        }
    }

    #[test]
    fn rejects_an_empty_executable() {
        let mut p = profile("pwsh");
        p.executable = " ".into();
        assert_eq!(
            codes(&validate_profile(&p)),
            [("executable", ProfileErrorCode::EmptyExecutable)]
        );
    }

    #[test]
    fn rejects_an_empty_id() {
        let errors = validate_profile(&profile(""));
        assert_eq!(codes(&errors), [("id", ProfileErrorCode::EmptyId)]);
    }

    #[test]
    fn rejects_env_names_that_break_the_environment_block() {
        let mut p = profile("pwsh");
        p.env = BTreeMap::from([
            ("".into(), "x".into()),
            ("A=B".into(), "x".into()),
            ("NUL\0".into(), "x".into()),
            ("ProgramFiles(x86)".into(), "x".into()),
            ("EDITOR".into(), "nvim".into()),
        ]);
        assert_eq!(
            codes(&validate_profile(&p)),
            [
                ("env.", ProfileErrorCode::InvalidEnvName),
                ("env.A=B", ProfileErrorCode::InvalidEnvName),
                ("env.NUL\0", ProfileErrorCode::InvalidEnvName),
            ]
        );
    }

    #[test]
    fn reports_every_problem_at_once() {
        let mut p = profile("pwsh");
        p.name = String::new();
        p.executable = String::new();
        assert_eq!(
            codes(&validate_profile(&p)),
            [
                ("name", ProfileErrorCode::EmptyName),
                ("executable", ProfileErrorCode::EmptyExecutable),
            ]
        );
    }

    #[test]
    fn rejects_each_repeat_of_an_id() {
        let errors = validate_profiles(&[
            profile("pwsh"),
            profile("cmd"),
            profile("pwsh"),
            profile("pwsh"),
        ]);
        assert_eq!(
            codes(&errors),
            [
                ("id", ProfileErrorCode::DuplicateId),
                ("id", ProfileErrorCode::DuplicateId),
            ]
        );
        assert!(errors.iter().all(|e| e.profile_id == "pwsh"));
    }

    #[test]
    fn empty_ids_are_not_reported_as_duplicates() {
        let errors = validate_profiles(&[profile(""), profile("")]);
        assert_eq!(
            codes(&errors),
            [
                ("id", ProfileErrorCode::EmptyId),
                ("id", ProfileErrorCode::EmptyId)
            ]
        );
    }

    #[test]
    fn serializes_for_the_ui_and_reads_in_logs() {
        let error = validate_profile(&profile("")).remove(0);
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({ "profileId": "", "field": "id", "code": "emptyId" })
        );
        let mut p = profile("pwsh");
        p.name = String::new();
        assert_eq!(
            validate_profile(&p)[0].to_string(),
            "profile \"pwsh\": name is empty (name)"
        );
    }
}
