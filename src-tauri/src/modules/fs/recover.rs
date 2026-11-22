//! Moves an unusable store file aside, so lut can start with the defaults and the user's data is
//! never dropped silently.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// A store file that could not be used, so lut started with the defaults instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredFile {
    /// Where the unusable file was moved; empty when it could not be read, and was left in place.
    pub backup_path: String,
    pub reason: String,
}

impl RecoveredFile {
    /// A file that could not be read: it stays where it is, since writing over it could lose it.
    pub fn left_in_place(reason: String) -> Self {
        Self {
            backup_path: String::new(),
            reason,
        }
    }
}

/// Moves `path` to `<prefix><ms>.json` in the same folder, keeping every earlier backup.
pub fn move_aside(path: &Path, prefix: &str, reason: String) -> RecoveredFile {
    let backup = backup_path(path.parent().unwrap_or(Path::new("")), prefix);
    match std::fs::rename(path, &backup) {
        Ok(()) => RecoveredFile {
            backup_path: backup.display().to_string(),
            reason,
        },
        Err(error) => RecoveredFile::left_in_place(format!("{reason}; backup failed: {error}")),
    }
}

/// Copies `path` to `<prefix><ms>.json` in the same folder and leaves it where it is, for a file lut
/// uses but will write over without some of its data.
pub fn copy_aside(path: &Path, prefix: &str, reason: String) -> RecoveredFile {
    let backup = backup_path(path.parent().unwrap_or(Path::new("")), prefix);
    match std::fs::copy(path, &backup) {
        Ok(_) => RecoveredFile {
            backup_path: backup.display().to_string(),
            reason,
        },
        Err(error) => RecoveredFile::left_in_place(format!("{reason}; backup failed: {error}")),
    }
}

/// A backup name no earlier backup uses.
fn backup_path(dir: &Path, prefix: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let mut n = 0;
    loop {
        let name = if n == 0 {
            format!("{prefix}{millis}.json")
        } else {
            format!("{prefix}{millis}-{n}.json")
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_the_file_aside_under_a_new_name_each_time() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        let mut backups = Vec::new();
        for content in ["first", "second"] {
            std::fs::write(&path, content).unwrap();
            let recovered = move_aside(&path, "store.corrupt-", "broken".into());
            assert_eq!(recovered.reason, "broken");
            assert!(!path.exists());
            backups.push(PathBuf::from(recovered.backup_path));
        }
        assert_ne!(backups[0], backups[1]);
        assert_eq!(std::fs::read_to_string(&backups[0]).unwrap(), "first");
        assert_eq!(std::fs::read_to_string(&backups[1]).unwrap(), "second");
        for backup in &backups {
            let name = backup.file_name().unwrap().to_string_lossy();
            assert!(name.starts_with("store.corrupt-") && name.ends_with(".json"));
        }
    }

    #[test]
    fn copies_the_file_aside_and_keeps_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        std::fs::write(&path, "kept").unwrap();
        let recovered = copy_aside(&path, "store.corrupt-", "skipped".into());
        assert_eq!(recovered.reason, "skipped");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "kept");
        assert_eq!(
            std::fs::read_to_string(&recovered.backup_path).unwrap(),
            "kept"
        );
    }

    #[test]
    fn a_file_that_cannot_be_copied_is_reported_as_left_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let recovered = copy_aside(&dir.path().join("missing.json"), "x-", "skipped".into());
        assert!(recovered.backup_path.is_empty());
        assert!(recovered.reason.starts_with("skipped; backup failed: "));
    }

    #[test]
    fn a_file_that_cannot_be_moved_is_reported_as_left_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let recovered = move_aside(&dir.path().join("missing.json"), "x-", "broken".into());
        assert!(recovered.backup_path.is_empty());
        assert!(recovered.reason.starts_with("broken; backup failed: "));
    }
}
