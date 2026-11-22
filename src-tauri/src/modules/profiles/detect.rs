//! Detected profiles: one per installed shell and one per WSL distro, found at runtime and
//! never stored (decisions 10 and 18). The user can hide them and change their look, kept as a
//! `DetectedOverride` in the store, but not edit or delete them.

use serde::Serialize;

use super::model::{
    DetectedOverride, ProfileAppearance, ProfileEnvironment, ProfileTab, TerminalProfile,
};
use super::store::ProfilesFile;
use super::validate::DETECTED_ID_PREFIX;
use crate::modules::pty::shell_init::{self, ShellInfo};
use crate::modules::workspace::RegisteredDistro;

/// Finds the installed shells and WSL distros. Blocking but quick: it checks files, reads the
/// registry for the distros (never `wsl.exe`, which can wake the WSL service) and may run `git`.
pub fn detect() -> Vec<TerminalProfile> {
    profiles_from(&shell_init::list_shells(), &wsl_distros())
}

#[cfg(windows)]
fn wsl_distros() -> Vec<RegisteredDistro> {
    crate::modules::workspace::registered_distros().unwrap_or_else(|error| {
        log::warn!("WSL distros not detected: {error}");
        Vec::new()
    })
}

#[cfg(not(windows))]
fn wsl_distros() -> Vec<RegisteredDistro> {
    Vec::new()
}

pub fn is_detected_id(id: &str) -> bool {
    id.starts_with(DETECTED_ID_PREFIX)
}

/// One profile per shell, then one per distro, with ids derived from their source so they stay
/// the same across detections.
pub fn profiles_from(shells: &[ShellInfo], distros: &[RegisteredDistro]) -> Vec<TerminalProfile> {
    let shells = shells.iter().map(|shell| TerminalProfile {
        executable: Some(shell.path.clone()),
        ..base(&shell.id, &shell.name)
    });
    let distros = distros.iter().map(|distro| TerminalProfile {
        // No executable: the distro's login shell, resolved at launch so that listing
        // profiles never starts a distro.
        executable: None,
        environment: ProfileEnvironment::Wsl {
            distro: Some(distro.name.clone()),
        },
        ..base(&format!("wsl:{}", distro.name), &distro.name)
    });
    shells.chain(distros).collect()
}

fn base(source: &str, name: &str) -> TerminalProfile {
    TerminalProfile {
        id: format!("{DETECTED_ID_PREFIX}{source}"),
        name: name.to_string(),
        executable: None,
        args: Vec::new(),
        env: Default::default(),
        load_user_profile: true,
        starting_directory: None,
        environment: ProfileEnvironment::Native,
        appearance: ProfileAppearance::default(),
        tab: ProfileTab::default(),
        close_behavior: Default::default(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileSource {
    Detected,
    Custom,
}

/// A profile as the UI lists it: detected ones carry the user's changes already applied.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    #[serde(flatten)]
    pub profile: TerminalProfile,
    pub source: ProfileSource,
    pub hidden: bool,
}

/// Detected profiles first, in detection order, then the user's own.
pub fn entries(file: &ProfilesFile, detected: &[TerminalProfile]) -> Vec<ProfileEntry> {
    let detected = detected.iter().map(|profile| {
        let changes = file.detected.get(&profile.id);
        ProfileEntry {
            profile: match changes {
                Some(changes) => with_changes(profile.clone(), changes),
                None => profile.clone(),
            },
            source: ProfileSource::Detected,
            hidden: changes.is_some_and(|changes| changes.hidden),
        }
    });
    let custom = file.profiles.iter().map(|profile| ProfileEntry {
        profile: profile.clone(),
        source: ProfileSource::Custom,
        hidden: false,
    });
    detected.chain(custom).collect()
}

/// Each field the user set wins over the detected one.
fn with_changes(mut profile: TerminalProfile, changes: &DetectedOverride) -> TerminalProfile {
    let set = &changes.appearance;
    let a = &mut profile.appearance;
    a.theme_id = set.theme_id.clone().or(a.theme_id.take());
    a.font_family = set.font_family.clone().or(a.font_family.take());
    a.font_size = set.font_size.or(a.font_size);
    a.font_weight = set.font_weight.clone().or(a.font_weight.take());
    a.cursor_style = set.cursor_style.or(a.cursor_style);
    a.cursor_blink = set.cursor_blink.or(a.cursor_blink);
    a.scrollback = set.scrollback.or(a.scrollback);
    a.padding = set.padding.or(a.padding);
    let set = &changes.tab;
    let t = &mut profile.tab;
    t.title = set.title.clone().or(t.title.take());
    t.color = set.color.clone().or(t.color.take());
    t.icon = set.icon.clone().or(t.icon.take());
    t.allow_shell_title = set.allow_shell_title;
    profile
}

#[cfg(test)]
mod tests {
    use super::super::model::Padding;
    use super::*;

    fn shell(id: &str, name: &str, path: &str) -> ShellInfo {
        ShellInfo {
            id: id.into(),
            name: name.into(),
            path: path.into(),
            integrated: true,
        }
    }

    fn distro(name: &str) -> RegisteredDistro {
        RegisteredDistro {
            name: name.into(),
            default: false,
        }
    }

    fn detected() -> Vec<TerminalProfile> {
        profiles_from(
            &[
                shell("pwsh", "PowerShell", r"C:\pwsh.exe"),
                shell("cmd", "Command Prompt", r"C:\cmd.exe"),
            ],
            &[distro("Ubuntu")],
        )
    }

    #[test]
    fn shells_and_distros_become_profiles_with_ids_from_their_source() {
        let profiles = detected();
        let ids: Vec<_> = profiles.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            ["detected:pwsh", "detected:cmd", "detected:wsl:Ubuntu"]
        );
        assert_eq!(profiles[0].name, "PowerShell");
        assert_eq!(profiles[0].executable.as_deref(), Some(r"C:\pwsh.exe"));
        assert_eq!(profiles[0].environment, ProfileEnvironment::Native);
        let ubuntu = &profiles[2];
        assert_eq!(ubuntu.name, "Ubuntu");
        assert_eq!(ubuntu.executable, None);
        assert_eq!(
            ubuntu.environment,
            ProfileEnvironment::Wsl {
                distro: Some("Ubuntu".into())
            }
        );
        assert!(profiles.iter().all(|p| is_detected_id(&p.id)));
    }

    #[test]
    fn detected_profiles_are_listed_before_custom_ones_with_the_users_changes() {
        let mut file = ProfilesFile::default();
        file.profiles.push(
            serde_json::from_value(serde_json::json!({
                "id": "mine", "name": "Mine", "executable": "nu.exe"
            }))
            .unwrap(),
        );
        let mut changes = DetectedOverride {
            hidden: true,
            ..Default::default()
        };
        changes.appearance.font_size = Some(15.0);
        changes.appearance.padding = Some(Padding {
            top: 2,
            right: 4,
            bottom: 2,
            left: 4,
        });
        changes.tab.color = Some("#e95420".into());
        file.detected.insert("detected:wsl:Ubuntu".into(), changes);

        let list = entries(&file, &detected());
        let summary: Vec<_> = list
            .iter()
            .map(|e| (e.profile.id.as_str(), e.source, e.hidden))
            .collect();
        assert_eq!(
            summary,
            [
                ("detected:pwsh", ProfileSource::Detected, false),
                ("detected:cmd", ProfileSource::Detected, false),
                ("detected:wsl:Ubuntu", ProfileSource::Detected, true),
                ("mine", ProfileSource::Custom, false),
            ]
        );
        let ubuntu = &list[2].profile;
        assert_eq!(ubuntu.appearance.font_size, Some(15.0));
        assert_eq!(
            ubuntu.appearance.padding,
            Some(Padding {
                top: 2,
                right: 4,
                bottom: 2,
                left: 4
            })
        );
        assert_eq!(ubuntu.tab.color.as_deref(), Some("#e95420"));
        assert_eq!(ubuntu.appearance.theme_id, None);
    }

    #[test]
    fn changes_to_a_profile_no_longer_detected_do_not_list_it() {
        let mut file = ProfilesFile::default();
        file.detected
            .insert("detected:wsl:Gone".into(), DetectedOverride::default());
        let list = entries(&file, &detected());
        assert_eq!(list.len(), 3);
        assert!(list.iter().all(|e| e.profile.id != "detected:wsl:Gone"));
    }

    #[test]
    fn an_entry_serializes_flat_for_the_ui() {
        let entry = &entries(&ProfilesFile::default(), &detected())[2];
        assert_eq!(
            serde_json::to_value(entry).unwrap(),
            serde_json::json!({
                "id": "detected:wsl:Ubuntu",
                "name": "Ubuntu",
                "args": [],
                "env": {},
                "loadUserProfile": true,
                "environment": { "kind": "wsl", "distro": "Ubuntu" },
                "appearance": {},
                "tab": { "allowShellTitle": true },
                "closeBehavior": "close",
                "source": "detected",
                "hidden": false
            })
        );
    }
}
