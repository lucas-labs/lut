use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A named way to start a terminal: what to run, where, and how its pane looks and behaves.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalProfile {
    /// Stable id the UI and saved panes refer to; set once when the profile is created.
    pub id: String,
    pub name: String,
    /// What to run. Optional only inside WSL, where unset means the distro's login shell
    /// (resolved at launch, so listing profiles never starts a distro).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
    /// Each argument on its own, never one shell string.
    #[serde(default)]
    pub args: Vec<String>,
    /// Variables set on top of the inherited environment: a value sets one, `null` removes an
    /// inherited one. lut's own `LUT_*` variables are not the profile's to set.
    #[serde(default)]
    pub env: BTreeMap<String, Option<String>>,
    /// PowerShell only: `false` skips the user's profile scripts (`-NoProfile`) while lut's
    /// integration still loads. Other programs ignore it.
    #[serde(default = "load_user_profile_default")]
    pub load_user_profile: bool,
    /// A plain string, as it may be a path inside a WSL distro.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starting_directory: Option<String>,
    #[serde(default)]
    pub environment: ProfileEnvironment,
    #[serde(default)]
    pub appearance: ProfileAppearance,
    #[serde(default)]
    pub tab: ProfileTab,
    #[serde(default)]
    pub close_behavior: CloseBehavior,
}

fn load_user_profile_default() -> bool {
    true
}

/// Where the executable runs: on the host, or inside a WSL distro (the default one when unset).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProfileEnvironment {
    #[default]
    Native,
    Wsl {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        distro: Option<String>,
    },
}

/// Appearance overrides; an unset field follows the global preference. The fields are the ones a
/// pane can change on its own (`.docs/architecture/per-pane-appearance.md`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAppearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor_style: Option<CursorStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor_blink: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrollback: Option<u32>,
    /// Space around the terminal text inside the pane, in CSS pixels. Full-screen programs (the
    /// alternate screen) fill the pane whatever it is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<Padding>,
}

/// Each side's padding, in CSS pixels.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Padding {
    pub top: u16,
    pub right: u16,
    pub bottom: u16,
    pub left: u16,
}

/// Same values as the frontend's `TerminalCursorStyle`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CursorStyle {
    Bar,
    Block,
    Underline,
}

/// How the profile's tabs look.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileTab {
    /// A built-in icon id or an image path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Whether titles the shell sets (OSC 0/2) rename the tab.
    #[serde(default = "allow_shell_title_default")]
    pub allow_shell_title: bool,
}

fn allow_shell_title_default() -> bool {
    true
}

impl Default for ProfileTab {
    fn default() -> Self {
        Self {
            icon: None,
            allow_shell_title: allow_shell_title_default(),
        }
    }
}

/// The user's changes to a detected profile, kept in the store by profile id. Detection owns
/// everything else, so it can change (a new path, a removed distro) without losing these.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedOverride {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
    #[serde(default)]
    pub appearance: ProfileAppearance,
    #[serde(default)]
    pub tab: ProfileTab,
}

/// What happens to the pane when its process exits. `Close` by default, as a pane always did.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseBehavior {
    /// Keep the pane and offer to close or restart it.
    Ask,
    #[default]
    Close,
    /// Keep the pane with its output and a notice that the process exited.
    KeepOpen,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn full_profile() -> TerminalProfile {
        TerminalProfile {
            id: "ubuntu-wsl".into(),
            name: "Ubuntu".into(),
            executable: Some("bash".into()),
            args: vec!["-l".into()],
            env: BTreeMap::from([
                ("EDITOR".into(), Some("nvim".into())),
                ("PAGER".into(), None),
            ]),
            load_user_profile: false,
            starting_directory: Some("~/code".into()),
            environment: ProfileEnvironment::Wsl {
                distro: Some("Ubuntu-24.04".into()),
            },
            appearance: ProfileAppearance {
                theme_id: Some("lut".into()),
                font_family: Some("Cascadia Mono".into()),
                font_size: Some(13.5),
                font_weight: Some("500".into()),
                cursor_style: Some(CursorStyle::Block),
                cursor_blink: Some(false),
                scrollback: Some(5000),
                padding: Some(Padding {
                    top: 4,
                    right: 8,
                    bottom: 4,
                    left: 8,
                }),
            },
            tab: ProfileTab {
                icon: Some("linux".into()),
                allow_shell_title: false,
            },
            close_behavior: CloseBehavior::KeepOpen,
        }
    }

    #[test]
    fn a_full_profile_round_trips_with_camel_case_keys() {
        let profile = full_profile();
        let value = serde_json::to_value(&profile).unwrap();
        assert_eq!(
            value,
            json!({
                "id": "ubuntu-wsl",
                "name": "Ubuntu",
                "executable": "bash",
                "args": ["-l"],
                "env": { "EDITOR": "nvim", "PAGER": null },
                "loadUserProfile": false,
                "startingDirectory": "~/code",
                "environment": { "kind": "wsl", "distro": "Ubuntu-24.04" },
                "appearance": {
                    "themeId": "lut",
                    "fontFamily": "Cascadia Mono",
                    "fontSize": 13.5,
                    "fontWeight": "500",
                    "cursorStyle": "block",
                    "cursorBlink": false,
                    "scrollback": 5000,
                    "padding": { "top": 4, "right": 8, "bottom": 4, "left": 8 }
                },
                "tab": {
                    "icon": "linux",
                    "allowShellTitle": false
                },
                "closeBehavior": "keepOpen"
            })
        );
        let back: TerminalProfile = serde_json::from_value(value).unwrap();
        assert_eq!(back, profile);
    }

    #[test]
    fn a_minimal_profile_loads_with_defaults() {
        let profile: TerminalProfile = serde_json::from_value(
            json!({ "id": "pwsh", "name": "PowerShell", "executable": "pwsh.exe" }),
        )
        .unwrap();
        assert!(profile.args.is_empty());
        assert!(profile.env.is_empty());
        assert!(profile.load_user_profile);
        assert_eq!(profile.starting_directory, None);
        assert_eq!(profile.environment, ProfileEnvironment::Native);
        assert_eq!(profile.appearance, ProfileAppearance::default());
        assert!(profile.tab.allow_shell_title);
        assert_eq!(profile.close_behavior, CloseBehavior::Close);
    }

    #[test]
    fn a_wsl_environment_may_leave_the_distro_to_the_default() {
        let environment: ProfileEnvironment =
            serde_json::from_value(json!({ "kind": "wsl" })).unwrap();
        assert_eq!(environment, ProfileEnvironment::Wsl { distro: None });
        assert_eq!(
            serde_json::to_value(ProfileEnvironment::Native).unwrap(),
            json!({ "kind": "native" })
        );
    }
}
