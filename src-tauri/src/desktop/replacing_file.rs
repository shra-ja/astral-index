//! A file written beside its target and then given the target's name, so the target
//! is replaced whole or not at all, and nothing half-written is left behind. Backup
//! saves this way, and restore puts its checked copy in place with the same flush
//! and rename. It also holds the path checks and the unused-name loop that these
//! writers and the kept copy share.
#[cfg(test)]
use crate::tests::filesystem as fs;
#[cfg(not(test))]
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// How many temporary names beside a target are tried before giving up.
const PARTIAL_NAMES: usize = 8;

/// A file's or folder's real path where it can be found, so links and differing
/// forms of the same path compare equal.
pub(super) fn real(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_owned())
}

/// Whether `target` would sit inside the data folder, where a written file could
/// replace the live database or its journal.
pub(super) fn in_data_folder(folder: Option<&Path>, target: &Path) -> bool {
    folder
        .zip(target.parent())
        .is_some_and(|(folder, parent)| real(parent).starts_with(real(folder)))
}

/// The first of `names` that `create` can claim, with what it made, trying the next
/// only while a name is taken. Taken names are never touched. Fails with any other
/// error at once, or as `AlreadyExists` when every name is taken.
pub(super) fn first_unused<N, T>(
    names: impl IntoIterator<Item = N>,
    mut create: impl FnMut(&N) -> io::Result<T>,
) -> io::Result<(N, T)> {
    for name in names {
        match create(&name) {
            Ok(made) => return Ok((name, made)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Err(io::ErrorKind::AlreadyExists.into())
}

/// Flush a written file to disk, then give it the target's name, replacing any file
/// there. Flushing needs the file open for writing, as Windows refuses otherwise.
pub(super) fn flush_and_rename(written: &Path, target: &Path) -> io::Result<()> {
    fs::OpenOptions::new()
        .write(true)
        .open(written)
        .and_then(|file| file.sync_all())?;
    fs::rename(written, target)
}

/// A temporary file claimed beside a target, to be written through its `path` and
/// then published under the target's name. Dropped unpublished, or when publishing
/// fails, it removes the temporary file, and only that file.
#[derive(Debug)]
pub(super) struct ReplacingFile {
    partial: PathBuf,
    target: PathBuf,
    published: bool,
}
impl ReplacingFile {
    /// Claim an unused temporary file beside `target` by creating it empty, so a
    /// file the user already has is never touched: `<target>.partial`, else
    /// `<target>.1.partial` and on.
    pub(super) fn claim(target: &Path) -> io::Result<Self> {
        let names = (0..PARTIAL_NAMES).map(|attempt| {
            let mut name = target.as_os_str().to_owned();
            if attempt > 0 {
                name.push(format!(".{attempt}"));
            }
            name.push(".partial");
            PathBuf::from(name)
        });
        let (partial, _) = first_unused(names, |partial: &PathBuf| fs::File::create_new(partial))?;
        Ok(Self {
            partial,
            target: target.to_owned(),
            published: false,
        })
    }
    /// Where to write the file before it is published.
    pub(super) fn path(&self) -> &Path {
        &self.partial
    }
    /// Flush the written file, then give it the target's name, replacing any file
    /// there.
    pub(super) fn publish(mut self) -> io::Result<()> {
        flush_and_rename(&self.partial, &self.target)?;
        self.published = true;
        Ok(())
    }
}
impl Drop for ReplacingFile {
    fn drop(&mut self) {
        if !self.published {
            let _ = fs::remove_file(&self.partial);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::filesystem::{self, Fixture as Files, has, removed_files, renamed};

    fn target() -> PathBuf {
        PathBuf::from("/backups/Astral-Index-backup-2026-10-16.sqlite")
    }
    /// The temporary name tried on `attempt`, counting from 0, built from the
    /// target as the platform joins it.
    fn partial(attempt: usize) -> PathBuf {
        let mut name = target().into_os_string();
        if attempt > 0 {
            name.push(format!(".{attempt}"));
        }
        name.push(".partial");
        PathBuf::from(name)
    }
    fn files(paths: impl IntoIterator<Item = PathBuf>) -> Files {
        Files {
            files: paths
                .into_iter()
                .map(|path| (path, b"the user's own file".to_vec()))
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn a_published_file_is_flushed_beside_the_target_then_takes_its_name() {
        filesystem::install(Files::default());
        let file = ReplacingFile::claim(&target()).unwrap();
        assert_eq!(file.path(), partial(0));
        assert!(has(&partial(0)));
        file.publish().unwrap();
        filesystem::inspect(|state| assert_eq!(state.synced, [partial(0)]));
        assert_eq!(renamed(), [(partial(0), target())]);
        assert!(removed_files().is_empty());
    }

    #[test]
    fn a_file_the_user_already_has_beside_the_target_is_never_touched() {
        // Their own file takes the first name, so the next free one is used.
        filesystem::install(files([partial(0)]));
        let file = ReplacingFile::claim(&target()).unwrap();
        assert_eq!(file.path(), partial(1));
        file.publish().unwrap();
        assert!(has(&partial(0)));
        assert_eq!(renamed(), [(partial(1), target())]);
        // When every name is taken, nothing is claimed and nothing removed.
        filesystem::install(files((0..PARTIAL_NAMES).map(partial)));
        let error = ReplacingFile::claim(&target()).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
        // A place that cannot be written fails at once.
        filesystem::install(Files {
            directories: vec![partial(0)],
            ..Default::default()
        });
        assert!(ReplacingFile::claim(&target()).is_err());
        assert!(removed_files().is_empty());
    }

    #[test]
    fn an_unpublished_or_unpublishable_file_is_removed_and_the_target_left_alone() {
        filesystem::install(Files::default());
        drop(ReplacingFile::claim(&target()).unwrap());
        assert_eq!(removed_files(), [partial(0)]);
        assert!(!has(&partial(0)));
        assert_eq!(renamed(), []);
        // Flushing fails, or the rename does.
        for files in [
            Files {
                sync_failure: true,
                ..Default::default()
            },
            Files {
                directories: vec![target()],
                ..Default::default()
            },
        ] {
            filesystem::install(files);
            assert!(ReplacingFile::claim(&target()).unwrap().publish().is_err());
            assert_eq!(removed_files(), [partial(0)]);
        }
    }

    #[test]
    fn the_first_unused_name_is_claimed_without_touching_taken_ones() {
        let taken = |name: &&str| match *name {
            "taken" => Err(io::Error::from(io::ErrorKind::AlreadyExists)),
            "unwritable" => Err(io::Error::from(io::ErrorKind::PermissionDenied)),
            _ => Ok(name.len()),
        };
        assert_eq!(first_unused(["taken", "free"], taken).unwrap(), ("free", 4));
        let refused = first_unused(["unwritable", "free"], taken).unwrap_err();
        assert_eq!(refused.kind(), io::ErrorKind::PermissionDenied);
        let full = first_unused(["taken", "taken"], taken).unwrap_err();
        assert_eq!(full.kind(), io::ErrorKind::AlreadyExists);
    }

    #[test]
    fn only_a_target_inside_the_data_folder_is_in_it() {
        let folder = PathBuf::from("/data/astral-index");
        // Whether or not the folders can be resolved.
        for directories in [vec![], vec![folder.clone(), folder.join("old")]] {
            filesystem::install(Files {
                directories,
                ..Default::default()
            });
            assert!(in_data_folder(
                Some(&folder),
                &folder.join("history.sqlite")
            ));
            assert!(in_data_folder(
                Some(&folder),
                &folder.join("old/backup.sqlite")
            ));
        }
        // Beside it, or anywhere when there is no data folder, is fine.
        let beside = PathBuf::from("/data/astral-index-backups/backup.sqlite");
        assert!(!in_data_folder(Some(&folder), &beside));
        assert!(!in_data_folder(None, &target()));
        assert!(!in_data_folder(Some(&folder), Path::new("/")));
    }
}
