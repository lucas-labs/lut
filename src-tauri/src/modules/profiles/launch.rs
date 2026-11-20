//! Opening a terminal by profile id (decision 10): the UI names a profile and the backend picks
//! the listed one and turns it into a launch, so no executable ever comes from the UI.

use super::detect::ProfileEntry;
use super::model::{ProfileEnvironment, TerminalProfile};
use crate::modules::pty::shell_init::{LaunchError, LaunchSpec, LaunchTarget};

/// The first profile not hidden, detected ones first: what opens when no default is stored.
pub fn first_visible(entries: &[ProfileEntry]) -> Option<&ProfileEntry> {
    entries.iter().find(|entry| !entry.hidden)
}

/// The profile that opens when none is asked for: the stored default while it is listed, else
/// the first one not hidden.
pub fn effective_default<'a>(
    entries: &'a [ProfileEntry],
    stored: Option<&str>,
) -> Option<&'a ProfileEntry> {
    stored
        .and_then(|id| entries.iter().find(|entry| entry.profile.id == id))
        .or_else(|| first_visible(entries))
}

/// The profile a terminal opens with: the one asked for, which must be listed (hidden ones
/// included), or the default. `None` only when nothing is listed, for the system's default shell.
pub fn pick<'a>(
    entries: &'a [ProfileEntry],
    stored_default: Option<&str>,
    requested: Option<&str>,
) -> Result<Option<&'a TerminalProfile>, LaunchError> {
    if let Some(id) = requested {
        return entries
            .iter()
            .find(|entry| entry.profile.id == id)
            .map(|entry| Some(&entry.profile))
            .ok_or_else(|| LaunchError::ProfileNotFound { id: id.to_string() });
    }
    if let Some(id) = stored_default.filter(|id| !entries.iter().any(|e| e.profile.id == *id)) {
        log::warn!("default profile {id:?} is no longer listed; opening the first profile");
    }
    Ok(effective_default(entries, stored_default).map(|entry| &entry.profile))
}

/// What a profile starts, and the directory it asks for, not checked yet (`pty_open` checks it).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileLaunch {
    pub spec: LaunchSpec,
    pub cwd: Option<String>,
}

/// The launch for `profile`, in the pane's directory or else the profile's starting directory.
/// No profile is the system's default shell on the host.
pub fn profile_launch(
    profile: Option<&TerminalProfile>,
    pane_cwd: Option<String>,
) -> ProfileLaunch {
    let pane_cwd = pane_cwd.filter(|cwd| !cwd.trim().is_empty());
    let Some(profile) = profile else {
        return ProfileLaunch {
            spec: LaunchSpec::new(),
            cwd: pane_cwd,
        };
    };
    let target = match &profile.environment {
        ProfileEnvironment::Native => LaunchTarget::Native,
        ProfileEnvironment::Wsl { distro } => LaunchTarget::Wsl {
            distro: distro.clone(),
        },
    };
    ProfileLaunch {
        spec: LaunchSpec {
            program: profile.executable.clone(),
            args: profile.args.clone(),
            load_user_profile: profile.load_user_profile,
            env: profile.env.clone(),
            cwd: None,
            target,
        },
        cwd: pane_cwd.or_else(|| profile.starting_directory.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::profiles::detect::{entries, profiles_from};
    use crate::modules::profiles::store::ProfilesFile;
    use crate::modules::profiles::DetectedOverride;
    use crate::modules::pty::shell_init::ShellInfo;
    use crate::modules::workspace::RegisteredDistro;
    use serde_json::json;

    fn custom(value: serde_json::Value) -> TerminalProfile {
        serde_json::from_value(value).unwrap()
    }

    /// pwsh and cmd detected, Ubuntu registered, and one profile of the user's.
    fn listed(file: &mut ProfilesFile) -> Vec<ProfileEntry> {
        let shell = |id: &str, path: &str| ShellInfo {
            id: id.into(),
            name: id.into(),
            path: path.into(),
            integrated: true,
        };
        let detected = profiles_from(
            &[
                shell("pwsh", r"C:\pwsh.exe"),
                shell("cmd", r"C:\Windows\System32\cmd.exe"),
            ],
            &[RegisteredDistro {
                name: "Ubuntu".into(),
                default: true,
            }],
        );
        file.profiles.push(custom(json!({
            "id": "mine", "name": "Mine", "executable": "nu.exe", "args": ["-l"]
        })));
        entries(file, &detected)
    }

    fn hide(file: &mut ProfilesFile, id: &str) {
        file.detected.insert(
            id.into(),
            DetectedOverride {
                hidden: true,
                ..Default::default()
            },
        );
    }

    fn picked(
        entries: &[ProfileEntry],
        stored: Option<&str>,
        requested: Option<&str>,
    ) -> Result<Option<String>, LaunchError> {
        pick(entries, stored, requested).map(|profile| profile.map(|p| p.id.clone()))
    }

    #[test]
    fn a_requested_profile_opens_detected_custom_or_hidden() {
        let mut file = ProfilesFile::default();
        hide(&mut file, "detected:cmd");
        let entries = listed(&mut file);
        for id in [
            "detected:pwsh",
            "detected:wsl:Ubuntu",
            "mine",
            "detected:cmd",
        ] {
            assert_eq!(picked(&entries, None, Some(id)), Ok(Some(id.to_string())));
        }
    }

    #[test]
    fn an_unknown_profile_is_not_found_without_a_fallback() {
        let entries = listed(&mut ProfilesFile::default());
        for id in ["gone", "detected:wsl:Debian"] {
            assert_eq!(
                picked(&entries, Some("mine"), Some(id)),
                Err(LaunchError::ProfileNotFound { id: id.into() })
            );
        }
    }

    #[test]
    fn no_request_opens_the_stored_default() {
        let entries = listed(&mut ProfilesFile::default());
        assert_eq!(
            picked(&entries, Some("mine"), None),
            Ok(Some("mine".into()))
        );
    }

    #[test]
    fn a_missing_or_stale_default_opens_the_first_visible_profile() {
        let mut file = ProfilesFile::default();
        hide(&mut file, "detected:pwsh");
        let entries = listed(&mut file);
        for stored in [None, Some("detected:git-bash")] {
            assert_eq!(
                picked(&entries, stored, None),
                Ok(Some("detected:cmd".into()))
            );
            assert_eq!(
                effective_default(&entries, stored).map(|e| e.profile.id.as_str()),
                Some("detected:cmd")
            );
        }
    }

    #[test]
    fn nothing_listed_opens_the_system_default_shell() {
        assert_eq!(picked(&[], None, None), Ok(None));
        assert_eq!(
            profile_launch(None, Some("/work".into())),
            ProfileLaunch {
                spec: LaunchSpec::new(),
                cwd: Some("/work".into()),
            }
        );
    }

    #[test]
    fn a_profile_becomes_its_launch() {
        let profile = custom(json!({
            "id": "dev", "name": "Dev", "executable": "pwsh.exe", "args": ["-NoLogo"],
            "env": { "EDITOR": "nvim", "PAGER": null }, "loadUserProfile": false,
            "startingDirectory": r"D:\repo"
        }));
        let launch = profile_launch(Some(&profile), None);
        assert_eq!(
            launch.spec,
            LaunchSpec {
                program: Some("pwsh.exe".into()),
                args: vec!["-NoLogo".into()],
                load_user_profile: false,
                env: [
                    ("EDITOR".into(), Some("nvim".into())),
                    ("PAGER".into(), None)
                ]
                .into(),
                cwd: None,
                target: LaunchTarget::Native,
            }
        );
        assert_eq!(launch.cwd.as_deref(), Some(r"D:\repo"));
    }

    #[test]
    fn the_pane_directory_wins_over_the_starting_directory() {
        let profile = custom(json!({
            "id": "dev", "name": "Dev", "executable": "pwsh.exe", "startingDirectory": r"D:\repo"
        }));
        let cwd = |pane: Option<&str>| profile_launch(Some(&profile), pane.map(Into::into)).cwd;
        assert_eq!(cwd(Some(r"C:\other")).as_deref(), Some(r"C:\other"));
        assert_eq!(cwd(Some("  ")).as_deref(), Some(r"D:\repo"));
        assert_eq!(cwd(None).as_deref(), Some(r"D:\repo"));
    }

    #[test]
    fn a_wsl_profile_targets_its_distro_or_the_default_one() {
        let ubuntu = custom(json!({
            "id": "u", "name": "U", "environment": { "kind": "wsl", "distro": "Ubuntu" }
        }));
        let default = custom(json!({
            "id": "d", "name": "D", "executable": "zsh", "environment": { "kind": "wsl" }
        }));
        let launch = profile_launch(Some(&ubuntu), None).spec;
        assert_eq!(launch.program, None);
        assert_eq!(
            launch.target,
            LaunchTarget::Wsl {
                distro: Some("Ubuntu".into())
            }
        );
        let launch = profile_launch(Some(&default), None).spec;
        assert_eq!(launch.program.as_deref(), Some("zsh"));
        assert_eq!(launch.target, LaunchTarget::Wsl { distro: None });
    }
}
