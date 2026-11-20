//! Crash-safe file writes shared by the editor and backend-owned stores.

use std::fmt::{Display, Formatter};
use std::io::{self, Write};
use std::path::Path;

use tempfile::NamedTempFile;

/// A failed atomic write, and whether the target had already been replaced when it failed.
#[derive(Debug)]
pub(crate) struct AtomicWriteError {
    pub error: io::Error,
    /// The new content is in place; only making the rename durable failed.
    pub committed: bool,
}

impl From<io::Error> for AtomicWriteError {
    fn from(error: io::Error) -> Self {
        Self {
            error,
            committed: false,
        }
    }
}

impl Display for AtomicWriteError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        self.error.fmt(f)
    }
}

/// Atomic write via O_EXCL tempfile in the target's parent, then rename.
/// The random suffix is what blocks pre-staged symlink attacks.
pub(crate) fn write_atomic(target: &Path, content: &[u8]) -> Result<(), AtomicWriteError> {
    let parent = target
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let mut tmp = NamedTempFile::new_in(parent)?;
    tmp.as_file_mut().write_all(content)?;
    tmp.as_file_mut().sync_all()?;
    tmp.persist(target).map_err(|e| e.error)?;
    sync_dir(parent).map_err(|error| AtomicWriteError {
        error,
        committed: true,
    })
}

/// Makes the rename itself durable. Windows has no directory fsync; NTFS journals the rename.
#[cfg(unix)]
fn sync_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::File::open(dir)?.sync_all().map_err(|error| {
        std::io::Error::new(
            error.kind(),
            format!("file replaced, but its directory could not be synced: {error}"),
        )
    })
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overwrites_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.txt");
        std::fs::write(&target, b"old").unwrap();
        write_atomic(&target, b"new").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_legacy_staging_symlink() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, b"untouched").unwrap();

        let target = dir.path().join("note.txt");
        // Pre-stage a symlink at the legacy deterministic staging path.
        let legacy = dir.path().join(".note.txt.lut.tmp");
        symlink(&outside, &legacy).unwrap();

        write_atomic(&target, b"payload").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"payload");
        // The pre-staged symlink target must not have been written through.
        assert_eq!(std::fs::read(&outside).unwrap(), b"untouched");
    }
}
