use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A named way to start a terminal: what to run, where, and how its pane looks and behaves.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalProfile {
    /// Stable id the UI and saved panes refer to; set once when the profile is created.
    pub id: String,
    pub name: String,
    pub executable: String,
    /// Each argument on its own, never one shell string.
    #[serde(default)]
    pub args: Vec<String>,
    /// Variables set on top of the inherited environment.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
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
    /// Initial title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Accent colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
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
            title: None,
            color: None,
            icon: None,
            allow_shell_title: allow_shell_title_default(),
        }
    }
}

/// What happens to the pane when its process exits.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseBehavior {
    #[default]
    Ask,
    Close,
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
            executable: "bash".into(),
            args: vec!["-l".into()],
            env: BTreeMap::from([("EDITOR".into(), "nvim".into())]),
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
            },
            tab: ProfileTab {
                title: Some("ubuntu".into()),
                color: Some("#e95420".into()),
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
                "env": { "EDITOR": "nvim" },
                "startingDirectory": "~/code",
                "environment": { "kind": "wsl", "distro": "Ubuntu-24.04" },
                "appearance": {
                    "themeId": "lut",
                    "fontFamily": "Cascadia Mono",
                    "fontSize": 13.5,
                    "fontWeight": "500",
                    "cursorStyle": "block",
                    "cursorBlink": false,
                    "scrollback": 5000
                },
                "tab": {
                    "title": "ubuntu",
                    "color": "#e95420",
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
        assert_eq!(profile.starting_directory, None);
        assert_eq!(profile.environment, ProfileEnvironment::Native);
        assert_eq!(profile.appearance, ProfileAppearance::default());
        assert!(profile.tab.allow_shell_title);
        assert_eq!(profile.close_behavior, CloseBehavior::Ask);
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
