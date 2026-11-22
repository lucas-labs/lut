//! Profile icons taken from the user's image files. lut keeps its own copy in `profile-icons/`
//! next to the profiles store, so moving or deleting the original keeps the icon.

use std::collections::HashSet;
use std::path::Path;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use super::store::{ProfilesFile, ProfilesState, BACKUP_PREFIX};
use crate::modules::fs::atomic::write_atomic;

/// Folder of the copies, inside lut's app config dir.
pub const ICONS_DIR: &str = "profile-icons";

/// `tab.icon` of a profile whose icon is a copy: this prefix, then the copy's name.
pub const IMAGE_PREFIX: &str = "image:";

pub const MAX_ICON_BYTES: usize = 1024 * 1024;

const EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"];

/// A built-in icon id (`shell-pwsh`), or `image:` and the name of a copy.
pub fn is_valid_icon(value: &str) -> bool {
    match value.strip_prefix(IMAGE_PREFIX) {
        Some(name) => is_image_name(name),
        None => {
            !value.is_empty()
                && value
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        }
    }
}

/// `<32 hex digits>.<extension>`, the names `import` gives: no name reaches outside the folder.
fn is_image_name(name: &str) -> bool {
    let Some((stem, extension)) = name.split_once('.') else {
        return false;
    };
    stem.len() == 32
        && stem
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && EXTENSIONS.contains(&extension)
}

/// Copies an image into the icons folder and returns the copy's name.
fn import(dir: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    let extension = extension.to_ascii_lowercase();
    if !EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("unsupported image type: {extension}"));
    }
    if bytes.is_empty() {
        return Err("the image is empty".into());
    }
    if bytes.len() > MAX_ICON_BYTES {
        return Err("the image is larger than 1 MB".into());
    }
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let stem: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let name = format!("{stem}.{extension}");
    let folder = dir.join(ICONS_DIR);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    write_atomic(&folder.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(name)
}

fn read(dir: &Path, name: &str) -> Result<Vec<u8>, String> {
    if !is_image_name(name) {
        return Err("not a profile icon".into());
    }
    std::fs::read(dir.join(ICONS_DIR).join(name)).map_err(|e| e.to_string())
}

fn referenced(file: &ProfilesFile) -> HashSet<String> {
    file.profiles
        .iter()
        .map(|profile| &profile.tab)
        .chain(file.detected.values().map(|changes| &changes.tab))
        .filter_map(|tab| tab.icon.as_deref()?.strip_prefix(IMAGE_PREFIX))
        .map(str::to_owned)
        .collect()
}

/// The copies the store files moved aside name: one may be fixed and put back by hand. Read as
/// text, since they did not parse.
fn named_by_backups(dir: &Path) -> HashSet<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return HashSet::new();
    };
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with(BACKUP_PREFIX))
        })
        .filter_map(|entry| std::fs::read(entry.path()).ok())
        .flat_map(|bytes| image_names_in(&String::from_utf8_lossy(&bytes)))
        .collect()
}

fn image_names_in(text: &str) -> Vec<String> {
    text.match_indices(IMAGE_PREFIX)
        .map(|(at, _)| {
            text[at + IMAGE_PREFIX.len()..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '.')
                .collect::<String>()
        })
        .filter(|name| is_image_name(name))
        .collect()
}

/// Deletes the copies no profile names, in the store or in a store moved aside: a replaced or
/// reset icon, a deleted profile. Only at startup, so a copy just imported, whose profile is not
/// saved yet, is never deleted.
pub fn remove_unused(dir: &Path, file: &ProfilesFile) {
    let Ok(entries) = std::fs::read_dir(dir.join(ICONS_DIR)) else {
        return;
    };
    let mut keep = referenced(file);
    keep.extend(named_by_backups(dir));
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if is_image_name(name) && !keep.contains(name) {
            if let Err(error) = std::fs::remove_file(entry.path()) {
                log::warn!("unused profile icon {name} not deleted: {error}");
            }
        }
    }
}

/// The image is the raw body, its extension the `x-icon-extension` header.
#[tauri::command]
pub async fn profile_icon_import(
    state: State<'_, ProfilesState>,
    request: Request<'_>,
) -> Result<String, String> {
    let extension = request
        .headers()
        .get("x-icon-extension")
        .and_then(|value| value.to_str().ok())
        .ok_or("missing x-icon-extension header")?
        .to_owned();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the image as a raw body".into());
    };
    let (dir, bytes) = (state.dir.clone(), bytes.clone());
    tauri::async_runtime::spawn_blocking(move || import(&dir, &bytes, &extension))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn profile_icon_read(
    state: State<'_, ProfilesState>,
    name: String,
) -> Result<Response, String> {
    let dir = state.dir.clone();
    tauri::async_runtime::spawn_blocking(move || read(&dir, &name).map(Response::new))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::profiles::model::{DetectedOverride, ProfileTab, TerminalProfile};

    const NAME: &str = "0123456789abcdef0123456789abcdef.png";

    fn with_icon(icon: &str) -> ProfileTab {
        ProfileTab {
            icon: Some(icon.into()),
            ..Default::default()
        }
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut names: Vec<_> = std::fs::read_dir(dir.join(ICONS_DIR))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn built_in_ids_and_copies_are_valid_icons() {
        for icon in [
            "terminal",
            "shell-pwsh",
            "agent-claude",
            &format!("image:{NAME}"),
        ] {
            assert!(is_valid_icon(icon), "{icon}");
        }
    }

    #[test]
    fn paths_and_other_names_are_not_icons() {
        for icon in [
            "",
            "Shell-Pwsh",
            "C:\\icons\\a.png",
            "image:",
            "image:../profiles.json",
            "image:..\\0123456789abcdef0123456789abcdef.png",
            "image:0123456789abcdef0123456789abcdef.exe",
            "image:0123456789ABCDEF0123456789ABCDEF.png",
            "image:0123456789abcdef.png",
            "image:0123456789abcdef0123456789abcdef.png.png",
        ] {
            assert!(!is_valid_icon(icon), "{icon}");
        }
    }

    #[test]
    fn an_import_is_read_back_by_its_name() {
        let dir = tempfile::tempdir().unwrap();
        let name = import(dir.path(), b"<svg/>", "SVG").unwrap();
        assert!(is_valid_icon(&format!("{IMAGE_PREFIX}{name}")));
        assert!(name.ends_with(".svg"));
        assert_eq!(read(dir.path(), &name).unwrap(), b"<svg/>");
    }

    #[test]
    fn an_import_rejects_other_types_and_sizes() {
        let dir = tempfile::tempdir().unwrap();
        assert!(import(dir.path(), b"MZ", "exe").is_err());
        assert!(import(dir.path(), b"", "png").is_err());
        assert!(import(dir.path(), &vec![0; MAX_ICON_BYTES + 1], "png").is_err());
        assert!(import(dir.path(), &vec![0; MAX_ICON_BYTES], "png").is_ok());
    }

    #[test]
    fn a_read_stays_in_the_icons_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("profiles.json"), "{}").unwrap();
        assert!(read(dir.path(), "../profiles.json").is_err());
        assert!(
            read(dir.path(), NAME).is_err(),
            "a missing copy is an error"
        );
    }

    #[test]
    fn only_the_copies_no_profile_names_are_removed() {
        let dir = tempfile::tempdir().unwrap();
        let profile_icon = import(dir.path(), b"a", "png").unwrap();
        let detected_icon = import(dir.path(), b"b", "png").unwrap();
        let unused = import(dir.path(), b"c", "png").unwrap();
        std::fs::write(dir.path().join(ICONS_DIR).join("notes.txt"), "mine").unwrap();
        let mut profile: TerminalProfile = serde_json::from_value(serde_json::json!({
            "id": "mine", "name": "Mine", "executable": "pwsh.exe"
        }))
        .unwrap();
        profile.tab = with_icon(&format!("{IMAGE_PREFIX}{profile_icon}"));
        let mut file = ProfilesFile {
            profiles: vec![profile],
            ..Default::default()
        };
        file.detected.insert(
            "detected:pwsh".into(),
            DetectedOverride {
                tab: with_icon(&format!("{IMAGE_PREFIX}{detected_icon}")),
                ..Default::default()
            },
        );
        remove_unused(dir.path(), &file);
        let mut expected = vec![profile_icon, detected_icon, "notes.txt".to_string()];
        expected.sort();
        assert_eq!(files(dir.path()), expected);
        assert!(!files(dir.path()).contains(&unused));
    }

    #[test]
    fn copies_a_store_moved_aside_names_survive_later_startups() {
        let dir = tempfile::tempdir().unwrap();
        let kept = import(dir.path(), b"a", "png").unwrap();
        let unused = import(dir.path(), b"b", "png").unwrap();
        std::fs::write(
            dir.path()
                .join(crate::modules::profiles::store::PROFILES_FILE),
            format!(r#"{{"profiles": [{{"tab": {{"icon": "image:{kept}"}}"#),
        )
        .unwrap();
        // The first startup moves the unusable file aside, the second finds no store at all.
        for _ in 0..2 {
            ProfilesState::load(dir.path().to_path_buf());
        }
        assert_eq!(files(dir.path()), [kept]);
        assert!(!files(dir.path()).contains(&unused));
    }

    #[test]
    fn removing_without_a_folder_does_nothing() {
        let dir = tempfile::tempdir().unwrap();
        remove_unused(dir.path(), &ProfilesFile::default());
        assert!(!dir.path().join(ICONS_DIR).exists());
    }
}
