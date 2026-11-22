//! The Spaces store file, `lut-spaces.json`, which the frontend reads and writes through the store
//! plugin. The plugin ignores a file it cannot parse and starts empty, so the next save would write
//! over it: the frontend opens the file here first, and an unusable one is moved aside and reported.

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};

use crate::modules::fs;
use crate::modules::fs::recover::{move_aside, RecoveredFile};

/// The store's file name; the plugin resolves it inside the app data dir.
const SPACES_FILE: &str = "lut-spaces.json";

/// Start of the name an unusable store file is moved aside under.
const BACKUP_PREFIX: &str = "lut-spaces.corrupt-";

/// Checks the store file the way the plugin parses it. A missing or readable one gives nothing; one
/// that is not a JSON object is moved aside; one that cannot be read is left in place.
fn check(path: &Path) -> Option<RecoveredFile> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            return Some(RecoveredFile::left_in_place(format!(
                "could not read {}: {error}",
                path.display()
            )))
        }
    };
    match serde_json::from_slice::<HashMap<String, serde_json::Value>>(&bytes) {
        Ok(_) => None,
        Err(error) => Some(move_aside(path, BACKUP_PREFIX, error.to_string())),
    }
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    tauri_plugin_store::resolve_store_path(app, SPACES_FILE).map_err(|e| e.to_string())
}

/// Called before the store plugin opens the file: what was wrong with it, if anything.
#[tauri::command]
pub async fn spaces_store_open(app: tauri::AppHandle) -> Result<Option<RecoveredFile>, String> {
    let path = store_path(&app)?;
    fs::blocking(move || Ok(check(&path))).await
}

/// Moves the store file aside when its content does not have the Spaces shape (`reason`).
#[tauri::command]
pub async fn spaces_store_move_aside(
    app: tauri::AppHandle,
    reason: String,
) -> Result<RecoveredFile, String> {
    let path = store_path(&app)?;
    fs::blocking(move || Ok(move_aside(&path, BACKUP_PREFIX, reason))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn backups(dir: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with(BACKUP_PREFIX)
            })
            .collect()
    }

    #[test]
    fn a_missing_file_is_fine() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(check(&dir.path().join(SPACES_FILE)), None);
    }

    #[test]
    fn a_json_object_stays_where_it_is() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SPACES_FILE);
        std::fs::write(&path, r#"{"spaces":"not a list"}"#).unwrap();
        assert_eq!(check(&path), None);
        assert!(path.is_file());
        assert!(backups(dir.path()).is_empty());
    }

    #[test]
    fn a_file_that_is_not_a_json_object_is_moved_aside() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SPACES_FILE);
        for (n, content) in ["{ not json", "[]", ""].into_iter().enumerate() {
            std::fs::write(&path, content).unwrap();
            let recovered = check(&path).unwrap();
            assert!(!recovered.backup_path.is_empty());
            assert_eq!(
                std::fs::read_to_string(&recovered.backup_path).unwrap(),
                content
            );
            assert!(!path.exists());
            assert_eq!(backups(dir.path()).len(), n + 1);
        }
    }

    #[test]
    fn invalid_utf8_is_moved_aside() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SPACES_FILE);
        std::fs::write(&path, b"{\"x\":\"\xff\"}").unwrap();
        assert!(!check(&path).unwrap().backup_path.is_empty());
    }

    #[test]
    fn a_file_that_cannot_be_read_is_left_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SPACES_FILE);
        std::fs::create_dir(&path).unwrap();
        let recovered = check(&path).unwrap();
        assert!(recovered.backup_path.is_empty());
        assert!(recovered.reason.starts_with("could not read"));
        assert!(path.is_dir());
    }
}
