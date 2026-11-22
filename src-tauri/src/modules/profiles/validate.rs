use std::collections::HashSet;
use std::fmt::{Display, Formatter};

use serde::Serialize;

use super::icons::is_valid_icon;
use super::model::{ProfileEnvironment, ProfileTab, TerminalProfile};

/// One problem with one field of a profile, for the UI to mark next to that field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileError {
    pub profile_id: String,
    /// camelCase path of the field: `name`, `executable`, `id`, `tab.icon`, or `env.<NAME>`.
    pub field: String,
    pub code: ProfileErrorCode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileErrorCode {
    EmptyId,
    EmptyName,
    /// Missing or blank; only a WSL profile may leave it unset, for the distro's login shell.
    EmptyExecutable,
    /// Empty, or holding `=` or NUL, which break the environment block on every platform.
    InvalidEnvName,
    /// Starts with `LUT_` (any case): lut sets those for its integration, after the profile's.
    ReservedEnvName,
    /// Holding NUL, which ends the value early on Windows and fails the spawn on Unix.
    InvalidEnvValue,
    DuplicateId,
    /// Starts with `detected:`, which only detected profiles use.
    ReservedId,
    /// Neither a built-in icon id nor the name of a copy lut keeps (`image:<name>`).
    InvalidIcon,
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
            ProfileErrorCode::ReservedEnvName => "environment variable name is reserved for lut",
            ProfileErrorCode::InvalidEnvValue => "environment variable value is invalid",
            ProfileErrorCode::DuplicateId => "id is used by another profile",
            ProfileErrorCode::ReservedId => "id uses the prefix of detected profiles",
            ProfileErrorCode::InvalidIcon => "icon is not a built-in icon or a stored image",
        };
        write!(
            f,
            "profile {:?}: {} ({})",
            self.profile_id, problem, self.field
        )
    }
}

impl std::error::Error for ProfileError {}

/// Ids of detected profiles start with this; the user's own profiles may not use it.
pub const DETECTED_ID_PREFIX: &str = "detected:";

fn is_blank(value: &str) -> bool {
    value.trim().is_empty()
}

fn is_valid_env_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['=', '\0'])
}

/// Prefix of lut's own variables (`LUT_CLI`, `LUT_PANE_ID`, ...), in any case: Windows names are
/// case-insensitive.
const RESERVED_ENV_PREFIX: &str = "LUT_";

fn is_reserved_env_name(name: &str) -> bool {
    name.get(..RESERVED_ENV_PREFIX.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(RESERVED_ENV_PREFIX))
}

/// Every problem in one of the user's profiles, not only the first. Detected profiles are built
/// by lut and not checked here.
pub fn validate_profile(profile: &TerminalProfile) -> Vec<ProfileError> {
    let mut errors = Vec::new();
    if is_blank(&profile.id) {
        errors.push(ProfileError::new(profile, "id", ProfileErrorCode::EmptyId));
    } else if profile.id.starts_with(DETECTED_ID_PREFIX) {
        errors.push(ProfileError::new(
            profile,
            "id",
            ProfileErrorCode::ReservedId,
        ));
    }
    if is_blank(&profile.name) {
        errors.push(ProfileError::new(
            profile,
            "name",
            ProfileErrorCode::EmptyName,
        ));
    }
    let executable_ok = match profile.executable.as_deref() {
        Some(executable) => !is_blank(executable),
        None => matches!(profile.environment, ProfileEnvironment::Wsl { .. }),
    };
    if !executable_ok {
        errors.push(ProfileError::new(
            profile,
            "executable",
            ProfileErrorCode::EmptyExecutable,
        ));
    }
    if let Some(error) = validate_tab(&profile.id, &profile.tab) {
        errors.push(error);
    }
    for (name, value) in &profile.env {
        let code = if !is_valid_env_name(name) {
            Some(ProfileErrorCode::InvalidEnvName)
        } else if is_reserved_env_name(name) {
            Some(ProfileErrorCode::ReservedEnvName)
        } else if value.as_deref().is_some_and(|value| value.contains('\0')) {
            Some(ProfileErrorCode::InvalidEnvValue)
        } else {
            None
        };
        if let Some(code) = code {
            errors.push(ProfileError::new(profile, format!("env.{name}"), code));
        }
    }
    errors
}

/// The problem with a profile's tab settings, for the user's profiles and the changes to detected
/// ones alike.
pub fn validate_tab(profile_id: &str, tab: &ProfileTab) -> Option<ProfileError> {
    let icon = tab.icon.as_deref()?;
    (!is_valid_icon(icon)).then(|| ProfileError {
        profile_id: profile_id.to_string(),
        field: "tab.icon".into(),
        code: ProfileErrorCode::InvalidIcon,
    })
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
        for executable in [None, Some(" ".to_string())] {
            let mut p = profile("pwsh");
            p.executable = executable;
            assert_eq!(
                codes(&validate_profile(&p)),
                [("executable", ProfileErrorCode::EmptyExecutable)]
            );
        }
    }

    #[test]
    fn a_wsl_profile_may_leave_the_executable_to_the_login_shell() {
        let mut p = profile("ubuntu");
        p.environment = ProfileEnvironment::Wsl { distro: None };
        p.executable = None;
        assert!(validate_profile(&p).is_empty());
        p.executable = Some(" ".into());
        assert_eq!(
            codes(&validate_profile(&p)),
            [("executable", ProfileErrorCode::EmptyExecutable)]
        );
    }

    #[test]
    fn rejects_the_detected_id_prefix() {
        let errors = validate_profile(&profile("detected:wsl:Ubuntu"));
        assert_eq!(codes(&errors), [("id", ProfileErrorCode::ReservedId)]);
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
            ("".into(), Some("x".into())),
            ("A=B".into(), Some("x".into())),
            ("NUL\0".into(), Some("x".into())),
            ("ProgramFiles(x86)".into(), Some("x".into())),
            ("EDITOR".into(), Some("nvim".into())),
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
    fn rejects_luts_own_variables_and_values_with_nul() {
        let mut p = profile("pwsh");
        p.env = BTreeMap::from([
            ("LUT_CLI".into(), Some("x".into())),
            ("lut_pane_id".into(), None),
            ("LUTX".into(), Some("x".into())),
            ("EDITOR".into(), Some("vi\0m".into())),
            ("PAGER".into(), None),
        ]);
        assert_eq!(
            codes(&validate_profile(&p)),
            [
                ("env.EDITOR", ProfileErrorCode::InvalidEnvValue),
                ("env.LUT_CLI", ProfileErrorCode::ReservedEnvName),
                ("env.lut_pane_id", ProfileErrorCode::ReservedEnvName),
            ]
        );
    }

    #[test]
    fn rejects_an_icon_that_is_neither_built_in_nor_stored() {
        let mut p = profile("pwsh");
        p.tab.icon = Some("shell-pwsh".into());
        assert!(validate_profile(&p).is_empty());
        p.tab.icon = Some(r"C:\icons\pwsh.png".into());
        assert_eq!(
            codes(&validate_profile(&p)),
            [("tab.icon", ProfileErrorCode::InvalidIcon)]
        );
    }

    #[test]
    fn reports_every_problem_at_once() {
        let mut p = profile("pwsh");
        p.name = String::new();
        p.executable = None;
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
