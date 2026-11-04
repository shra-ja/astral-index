//! How native code reads a cache, a player log or a history file, whether the user
//! chose it or discovery resolved it: opened read-only as a regular file, and read
//! within its format's bound.
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
#[cfg(not(test))]
use std::fs;
#[cfg(all(unix, not(test)))]
use std::os::unix::fs::OpenOptionsExt;
use std::{io::Read, path::Path};

#[derive(Debug, PartialEq, Eq)]
pub enum FileError {
    Unreadable,
    NotRegularFile,
    TooLarge,
}

/// Open `path` read-only, refusing anything but a regular file.
pub fn open(path: &Path) -> Result<fs::File, FileError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    // Opening a FIFO must not wait for a writer before we can inspect its type.
    // Check the opened handle, so replacing the path cannot bypass validation.
    #[cfg(unix)]
    options.custom_flags(libc::O_NONBLOCK);
    let file = options.open(path).map_err(|_| FileError::Unreadable)?;
    if !file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        return Err(FileError::NotRegularFile);
    }
    Ok(file)
}

/// Read the whole of `path`, refusing a file over `bound` bytes. At most one byte
/// past the bound is read, so allocation stays bounded even if the file grows.
pub fn read(path: &Path, bound: usize) -> Result<Vec<u8>, FileError> {
    let mut bytes = Vec::new();
    open(path)?
        .take(bound as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| FileError::Unreadable)?;
    if bytes.len() > bound {
        return Err(FileError::TooLarge);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};

    fn path() -> &'static Path {
        Path::new("selected/file")
    }
    fn holding(bytes: &[u8]) -> Files {
        Files {
            files: [(path().to_owned(), bytes.to_vec())].into(),
            ..Default::default()
        }
    }

    #[test]
    fn a_regular_file_is_read_whole_within_its_bound_and_nothing_else_is_touched() {
        filesystem::install(holding(b"synthetic"));
        assert_eq!(read(path(), 9).unwrap(), b"synthetic");
        filesystem::inspect(|state| {
            assert_eq!(state.reads, 9);
            assert!(state.accessed.iter().all(|accessed| accessed == path()));
        });
        let mut opened = String::new();
        open(path()).unwrap().read_to_string(&mut opened).unwrap();
        assert_eq!(opened, "synthetic");
    }

    #[test]
    fn a_file_over_its_bound_is_refused_after_one_byte_past_it() {
        filesystem::install(holding(&[0; 100]));
        assert_eq!(read(path(), 10), Err(FileError::TooLarge));
        assert_eq!(filesystem::inspect(|state| state.reads), 11);
    }

    #[test]
    fn missing_failing_and_irregular_files_are_refused() {
        filesystem::install(Files::default());
        assert_eq!(read(path(), 10), Err(FileError::Unreadable));
        filesystem::install(Files {
            read_failure: true,
            ..holding(b"synthetic")
        });
        assert_eq!(read(path(), 10), Err(FileError::Unreadable));
        filesystem::install(Files {
            directories: vec![path().to_owned()],
            ..Default::default()
        });
        assert_eq!(read(path(), 10), Err(FileError::NotRegularFile));
        assert_eq!(open(path()).err(), Some(FileError::NotRegularFile));
        filesystem::install(Files {
            metadata_failure: true,
            ..holding(b"synthetic")
        });
        assert_eq!(read(path(), 10), Err(FileError::NotRegularFile));
    }
}
