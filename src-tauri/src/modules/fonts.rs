//! Installed font files for the terminal's hinted glyph rasterizer.
//!
//! The webview can draw with an installed font but never hands out its file, and the terminal's
//! rasterizer (`packages/glyph-raster`) needs the outlines and hinting program in it. These
//! commands find a family's face the way CSS font matching does and return its bytes. Only files
//! the system font scan found are ever read.

use std::path::PathBuf;
use std::sync::OnceLock;

use fontdb::{Database, Family, Query, Source, Stretch, Style, Weight};
use serde::Serialize;
use tauri::ipc::Response;

/// The installed face that best matches a family, weight and style.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFace {
    /// Opaque key for `font_face_data`.
    pub id: String,
    /// Face index inside the file (a font collection holds several).
    pub index: u32,
    pub weight: u16,
    pub italic: bool,
}

fn system_fonts() -> &'static Database {
    static DATABASE: OnceLock<Database> = OnceLock::new();
    DATABASE.get_or_init(|| {
        let mut database = Database::new();
        database.load_system_fonts();
        database
    })
}

fn source_path(source: &Source) -> Option<&PathBuf> {
    match source {
        Source::File(path) => Some(path),
        _ => None,
    }
}

/// The face `family` (matched without regard to case, as CSS does) offers closest to `weight` and
/// `italic`, by CSS font matching.
pub fn find_face(database: &Database, family: &str, weight: u16, italic: bool) -> Option<FontFace> {
    let name = database
        .faces()
        .flat_map(|face| face.families.iter())
        .map(|(name, _)| name.as_str())
        .find(|name| name.eq_ignore_ascii_case(family))?;
    let query = Query {
        families: &[Family::Name(name)],
        weight: Weight(weight),
        stretch: Stretch::Normal,
        style: if italic { Style::Italic } else { Style::Normal },
    };
    let face = database.face(database.query(&query)?)?;
    Some(FontFace {
        id: source_path(&face.source)?.to_string_lossy().into_owned(),
        index: face.index,
        weight: face.weight.0,
        italic: face.style != Style::Normal,
    })
}

/// Whether `id` names a file the system font scan found.
pub fn is_known_file(database: &Database, id: &str) -> bool {
    database
        .faces()
        .filter_map(|face| source_path(&face.source))
        .any(|path| path.as_os_str() == std::ffi::OsStr::new(id))
}

#[tauri::command]
pub async fn font_face_find(family: String, weight: u16, italic: bool) -> Option<FontFace> {
    tauri::async_runtime::spawn_blocking(move || find_face(system_fonts(), &family, weight, italic))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn font_face_data(id: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !is_known_file(system_fonts(), &id) {
            return Err("not an installed font file".to_owned());
        }
        std::fs::read(&id).map(Response::new).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    // A variable font whose name table calls its default instance "Source Code Pro ExtraLight".
    const FONT: &[u8] = include_bytes!("../../../src/assets/fonts/source-code-pro-latin.ttf");

    fn database() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("scp.ttf"), FONT).unwrap();
        let mut database = Database::new();
        database.load_fonts_dir(dir.path());
        (dir, database)
    }

    #[test]
    fn finds_a_family_regardless_of_case() {
        let (dir, database) = database();
        let face = find_face(&database, "source code pro extralight", 400, false).unwrap();
        assert_eq!(PathBuf::from(&face.id), dir.path().join("scp.ttf"));
        assert_eq!(face.index, 0);
        assert!(!face.italic);
    }

    #[test]
    fn reports_the_style_it_found_for_a_missing_italic() {
        let (_dir, database) = database();
        let face = find_face(&database, "Source Code Pro ExtraLight", 700, true).unwrap();
        assert!(!face.italic, "the upright face stands in; the caller slants it");
    }

    #[test]
    fn unknown_families_have_no_face() {
        let (_dir, database) = database();
        assert_eq!(find_face(&database, "No Such Font", 400, false), None);
    }

    #[test]
    fn only_scanned_files_are_readable() {
        let (dir, database) = database();
        let known = dir.path().join("scp.ttf");
        assert!(is_known_file(&database, &known.to_string_lossy()));
        let other = dir.path().join("secret.txt");
        assert!(!is_known_file(&database, &other.to_string_lossy()));
    }
}
