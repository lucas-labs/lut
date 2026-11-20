use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::model::TerminalProfile;
use super::validate::validate_profiles;
use crate::modules::fs::atomic::{write_atomic, AtomicWriteError};

/// Store file name inside lut's app config dir.
pub const PROFILES_FILE: &str = "profiles.json";

/// What the store file holds: the user's own profiles. Detected shells are listed at runtime
/// (E14-06) and never written here.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesFile {
    #[serde(default)]
    pub profiles: Vec<TerminalProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_profile_id: Option<String>,
}

/// A store file that could not be used, so lut started with the defaults instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredFile {
    /// Where the unusable file was moved; empty when it could not be read, and was left in place.
    pub backup_path: String,
    pub reason: String,
}

#[derive(Debug)]
pub struct LoadOutcome {
    pub file: ProfilesFile,
    pub recovered: Option<RecoveredFile>,
}

/// Reads the store in `dir`. A missing file gives the defaults; an unusable one is moved aside as
/// `profiles.corrupt-<ms>.json` and reported, so the user's data is never dropped silently.
pub fn load(dir: &Path) -> LoadOutcome {
    let path = dir.join(PROFILES_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return defaults(None),
        Err(error) => {
            // Leave a file we cannot read where it is: writing over it could lose it.
            return defaults(Some(RecoveredFile {
                backup_path: String::new(),
                reason: format!("could not read {}: {error}", path.display()),
            }));
        }
    };
    // Checked up front: serde skips unknown values without validating their UTF-8.
    let parsed = std::str::from_utf8(&bytes)
        .map_err(|error| error.to_string())
        .and_then(|text| {
            serde_json::from_str::<ProfilesFile>(text).map_err(|error| error.to_string())
        });
    let reason = match parsed {
        Ok(file) => match validate_profiles(&file.profiles).first() {
            None => {
                return LoadOutcome {
                    file,
                    recovered: None,
                }
            }
            Some(error) => error.to_string(),
        },
        Err(reason) => reason,
    };
    let backup = backup_path(dir);
    let recovered = match std::fs::rename(&path, &backup) {
        Ok(()) => RecoveredFile {
            backup_path: backup.display().to_string(),
            reason,
        },
        Err(error) => RecoveredFile {
            backup_path: String::new(),
            reason: format!("{reason}; backup failed: {error}"),
        },
    };
    defaults(Some(recovered))
}

/// Writes the store atomically, creating `dir` when it does not exist yet.
pub(crate) fn save(dir: &Path, file: &ProfilesFile) -> Result<(), AtomicWriteError> {
    std::fs::create_dir_all(dir)?;
    let mut json = serde_json::to_vec_pretty(file).map_err(io::Error::other)?;
    json.push(b'\n');
    write_atomic(&dir.join(PROFILES_FILE), &json)
}

fn defaults(recovered: Option<RecoveredFile>) -> LoadOutcome {
    LoadOutcome {
        file: ProfilesFile::default(),
        recovered,
    }
}

/// A backup name no earlier backup uses.
fn backup_path(dir: &Path) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let mut n = 0;
    loop {
        let name = if n == 0 {
            format!("profiles.corrupt-{millis}.json")
        } else {
            format!("profiles.corrupt-{millis}-{n}.json")
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// The loaded profiles, plus the startup recovery the UI has not been told about yet.
pub struct ProfilesState {
    pub dir: PathBuf,
    pub file: Mutex<ProfilesFile>,
    load_error: Mutex<Option<RecoveredFile>>,
    /// Set when startup left an unusable `profiles.json` in place: saving would overwrite it.
    writes_blocked: Option<String>,
}

impl ProfilesState {
    pub fn load(dir: PathBuf) -> Self {
        let outcome = load(&dir);
        if let Some(recovered) = &outcome.recovered {
            log::warn!(
                "profiles store unusable, started with defaults: {} (backup: {})",
                recovered.reason,
                recovered.backup_path
            );
        }
        let writes_blocked = outcome
            .recovered
            .as_ref()
            .filter(|recovered| recovered.backup_path.is_empty())
            .map(|recovered| {
                format!(
                    "{PROFILES_FILE} could not be used and was left in place ({}); fix or move it                      and restart lut before changing profiles",
                    recovered.reason
                )
            });
        Self {
            dir,
            file: Mutex::new(outcome.file),
            load_error: Mutex::new(outcome.recovered),
            writes_blocked,
        }
    }

    /// Why profiles cannot be saved this session, if they cannot.
    pub fn writes_blocked(&self) -> Option<&str> {
        self.writes_blocked.as_deref()
    }
}

/// The startup recovery, once: later calls return `None`.
#[tauri::command]
pub fn profiles_take_load_error(state: tauri::State<'_, ProfilesState>) -> Option<RecoveredFile> {
    state
        .load_error
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(id: &str) -> TerminalProfile {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": id, "executable": "pwsh.exe"
        }))
        .unwrap()
    }

    fn backups(dir: &Path) -> Vec<PathBuf> {
        let mut found: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("profiles.corrupt-")
            })
            .collect();
        found.sort();
        found
    }

    #[test]
    fn a_missing_file_loads_the_defaults_without_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let outcome = load(dir.path());
        assert_eq!(outcome.file, ProfilesFile::default());
        assert_eq!(outcome.recovered, None);
    }

    #[test]
    fn saved_profiles_load_back() {
        let dir = tempfile::tempdir().unwrap();
        let file = ProfilesFile {
            profiles: vec![profile("pwsh"), profile("cmd")],
            default_profile_id: Some("cmd".into()),
        };
        save(dir.path(), &file).unwrap();
        let outcome = load(dir.path());
        assert_eq!(outcome.file, file);
        assert_eq!(outcome.recovered, None);
    }

    #[test]
    fn save_creates_the_config_dir() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("dev.lucode.lut");
        save(&nested, &ProfilesFile::default()).unwrap();
        assert!(nested.join(PROFILES_FILE).is_file());
    }

    #[test]
    fn a_corrupt_file_is_backed_up_and_replaced_by_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(PROFILES_FILE), "{ not json").unwrap();
        let outcome = load(dir.path());
        assert_eq!(outcome.file, ProfilesFile::default());
        let recovered = outcome.recovered.unwrap();
        let found = backups(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(recovered.backup_path, found[0].display().to_string());
        assert_eq!(std::fs::read_to_string(&found[0]).unwrap(), "{ not json");
        assert!(!dir.path().join(PROFILES_FILE).exists());
    }

    #[test]
    fn invalid_utf8_is_treated_as_a_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let inside_ignored_value = b"{\"profiles\":[],\"extra\":\"\xff\"}".as_slice();
        for (n, content) in [[0xff, 0xfe, b'{'].as_slice(), inside_ignored_value]
            .into_iter()
            .enumerate()
        {
            std::fs::write(dir.path().join(PROFILES_FILE), content).unwrap();
            let outcome = load(dir.path());
            assert!(!outcome.recovered.unwrap().backup_path.is_empty());
            assert_eq!(backups(dir.path()).len(), n + 1);
        }
    }

    #[test]
    fn invalid_profiles_are_treated_as_a_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = ProfilesFile {
            profiles: vec![profile("pwsh"), profile("pwsh")],
            default_profile_id: None,
        };
        save(dir.path(), &file).unwrap();
        let outcome = load(dir.path());
        assert_eq!(outcome.file, ProfilesFile::default());
        assert!(outcome
            .recovered
            .unwrap()
            .reason
            .contains("another profile"));
        assert_eq!(backups(dir.path()).len(), 1);
    }

    #[test]
    fn repeated_corruption_keeps_every_backup() {
        let dir = tempfile::tempdir().unwrap();
        for content in ["first", "second"] {
            std::fs::write(dir.path().join(PROFILES_FILE), content).unwrap();
            load(dir.path());
        }
        let contents: Vec<_> = backups(dir.path())
            .iter()
            .map(|p| std::fs::read_to_string(p).unwrap())
            .collect();
        assert_eq!(contents.len(), 2);
        assert!(contents.contains(&"first".to_string()));
        assert!(contents.contains(&"second".to_string()));
    }
}
