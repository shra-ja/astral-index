//! In-memory filesystem double. Unit tests never call the host filesystem.
use std::{
    cell::RefCell,
    collections::BTreeMap,
    ffi::OsString,
    io::{self, Cursor, Read, Write},
    path::{Path, PathBuf},
};

#[derive(Default)]
pub struct Fixture {
    pub entries: Option<Vec<io::Result<DirEntry>>>,
    /// Repeatable per-directory listings, checked before the single-use `entries`.
    pub listings: BTreeMap<PathBuf, Vec<PathBuf>>,
    pub files: BTreeMap<PathBuf, Vec<u8>>,
    pub directories: Vec<PathBuf>,
    pub metadata_failure: bool,
    /// Lengths that metadata reports in place of a file's contents' length, so a
    /// large file needs no contents.
    pub lengths: BTreeMap<PathBuf, u64>,
    pub reads: usize,
    pub accessed: Vec<PathBuf>,
    /// Folders removed, in order; removal always succeeds.
    pub removed: Vec<PathBuf>,
    /// Files removed, in order, whether or not they existed.
    pub removed_files: Vec<PathBuf>,
    /// Files renamed, in order, as `(from, to)`.
    pub renamed: Vec<(PathBuf, PathBuf)>,
    /// Files flushed to disk, in order; `sync_failure` makes flushing fail.
    pub synced: Vec<PathBuf>,
    pub sync_failure: bool,
    /// Writing to an open file fails.
    pub write_failure: bool,
    /// Reading from an open file fails.
    pub read_failure: bool,
}
thread_local! { static FIXTURE: RefCell<Fixture> = RefCell::default(); }
pub fn install(fixture: Fixture) {
    FIXTURE.with(|state| *state.borrow_mut() = fixture);
}
pub fn inspect<T>(inspect: impl FnOnce(&Fixture) -> T) -> T {
    FIXTURE.with(|state| inspect(&state.borrow()))
}
fn missing() -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, "synthetic I/O failure")
}
fn access(path: &Path) {
    FIXTURE.with(|state| state.borrow_mut().accessed.push(path.to_owned()));
}
pub struct DirEntry(pub PathBuf);
impl DirEntry {
    pub fn path(&self) -> PathBuf {
        self.0.clone()
    }
    pub fn file_name(&self) -> OsString {
        self.0.file_name().unwrap().to_owned()
    }
}
pub fn read_dir(path: &Path) -> io::Result<std::vec::IntoIter<io::Result<DirEntry>>> {
    access(path);
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        if let Some(children) = state.listings.get(path) {
            let entries: Vec<_> = children.iter().cloned().map(DirEntry).map(Ok).collect();
            return Ok(entries.into_iter());
        }
        state.entries.take().map(Vec::into_iter).ok_or_else(missing)
    })
}
/// Records the folder as removed. Takes any path, as `std::fs::remove_dir_all` does.
pub fn remove_dir_all(path: impl AsRef<Path>) -> io::Result<()> {
    FIXTURE.with(|state| state.borrow_mut().removed.push(path.as_ref().to_owned()));
    Ok(())
}
/// Creates the folder, unless a file already occupies its path.
pub fn create_dir_all(path: &Path) -> io::Result<()> {
    access(path);
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        if state.files.contains_key(path) {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "synthetic file",
            ));
        }
        state.directories.push(path.to_owned());
        Ok(())
    })
}
/// Writes the file, unless a folder occupies its path.
pub fn write(path: impl AsRef<Path>, contents: impl AsRef<[u8]>) -> io::Result<()> {
    let path = path.as_ref();
    access(path);
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        if state.directories.contains(&path.to_owned()) {
            return Err(io::Error::new(
                io::ErrorKind::IsADirectory,
                "synthetic folder",
            ));
        }
        state
            .files
            .insert(path.to_owned(), contents.as_ref().to_vec());
        Ok(())
    })
}
/// Reads a file's text, failing if it is missing.
pub fn read_to_string(path: impl AsRef<Path>) -> io::Result<String> {
    let path = path.as_ref();
    access(path);
    FIXTURE.with(|state| {
        let state = state.borrow();
        let bytes = state.files.get(path).ok_or_else(missing)?;
        Ok(String::from_utf8_lossy(bytes).into_owned())
    })
}
/// Removes a file, failing if it did not exist; every attempt is recorded.
pub fn remove_file(path: impl AsRef<Path>) -> io::Result<()> {
    let path = path.as_ref();
    access(path);
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        state.removed_files.push(path.to_owned());
        state.files.remove(path).map(drop).ok_or_else(missing)
    })
}
/// Moves a file to `to`, failing if it is missing or a folder occupies `to`.
pub fn rename(from: impl AsRef<Path>, to: impl AsRef<Path>) -> io::Result<()> {
    let (from, to) = (from.as_ref(), to.as_ref());
    access(from);
    access(to);
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        state.renamed.push((from.to_owned(), to.to_owned()));
        if state.directories.contains(&to.to_owned()) {
            return Err(io::Error::new(
                io::ErrorKind::IsADirectory,
                "synthetic folder",
            ));
        }
        let contents = state.files.remove(from).ok_or_else(missing)?;
        state.files.insert(to.to_owned(), contents);
        Ok(())
    })
}
/// A folder's real path: itself if it exists here, else a failure. A lookup, so it
/// is not recorded as an access.
pub fn canonicalize(path: impl AsRef<Path>) -> io::Result<PathBuf> {
    let path = path.as_ref();
    FIXTURE.with(|state| {
        let state = state.borrow();
        state
            .directories
            .contains(&path.to_owned())
            .then(|| path.to_owned())
            .ok_or_else(missing)
    })
}
pub struct Metadata {
    file: bool,
    len: u64,
}
impl Metadata {
    pub fn is_file(&self) -> bool {
        self.file
    }
    pub fn is_dir(&self) -> bool {
        !self.file
    }
    pub fn len(&self) -> u64 {
        self.len
    }
}
pub fn metadata(path: &Path) -> io::Result<Metadata> {
    access(path);
    FIXTURE.with(|state| {
        let state = state.borrow();
        if state.metadata_failure {
            return Err(missing());
        }
        if let Some(contents) = state.files.get(path) {
            let len = state.lengths.get(path).copied();
            Ok(Metadata {
                file: true,
                len: len.unwrap_or(contents.len() as u64),
            })
        } else if state.directories.contains(&path.to_owned()) {
            Ok(Metadata {
                file: false,
                len: 0,
            })
        } else {
            Err(missing())
        }
    })
}
pub struct File {
    path: PathBuf,
    reader: Cursor<Vec<u8>>,
    /// Whether the file was opened for writing, which Windows needs to flush it.
    writable: bool,
}
/// Opens cache files for reading without blocking, or a file for writing.
pub struct OpenOptions {
    read: bool,
    write: bool,
    flags: i32,
}
impl OpenOptions {
    pub fn new() -> Self {
        Self {
            read: false,
            write: false,
            flags: 0,
        }
    }
    pub fn read(&mut self, read: bool) -> &mut Self {
        self.read = read;
        self
    }
    pub fn write(&mut self, write: bool) -> &mut Self {
        self.write = write;
        self
    }
    #[cfg(unix)]
    pub fn custom_flags(&mut self, flags: i32) -> &mut Self {
        self.flags = flags;
        self
    }
    pub fn open(&self, path: &Path) -> io::Result<File> {
        if self.write {
            assert!(
                !self.read && self.flags == 0,
                "a file is opened to write it only"
            );
            return File::open(path).map(|file| File {
                writable: true,
                ..file
            });
        }
        assert!(self.read, "cache files must be opened for reading");
        #[cfg(unix)]
        assert_eq!(
            self.flags,
            libc::O_NONBLOCK,
            "opening special files must not block"
        );
        #[cfg(not(unix))]
        assert_eq!(self.flags, 0);
        File::open(path)
    }
}
impl File {
    /// Creates an empty file, failing if a file has the name already, or if a folder
    /// does, which stands for a place that cannot be written.
    pub fn create_new(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        access(path);
        FIXTURE.with(|state| {
            let mut state = state.borrow_mut();
            if state.files.contains_key(path) {
                return Err(io::Error::new(io::ErrorKind::AlreadyExists, "synthetic"));
            }
            if state.directories.contains(&path.to_owned()) {
                return Err(io::Error::new(io::ErrorKind::PermissionDenied, "synthetic"));
            }
            state.files.insert(path.to_owned(), Vec::new());
            Ok(Self {
                path: path.to_owned(),
                reader: Cursor::new(Vec::new()),
                writable: true,
            })
        })
    }
    /// Records the flush, failing when the fixture says so, or, as Windows does,
    /// when the file was opened for reading only.
    pub fn sync_all(&self) -> io::Result<()> {
        if !self.writable {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "read only"));
        }
        FIXTURE.with(|state| {
            let mut state = state.borrow_mut();
            state.synced.push(self.path.clone());
            if state.sync_failure {
                Err(missing())
            } else {
                Ok(())
            }
        })
    }
    pub fn open(path: &Path) -> io::Result<Self> {
        access(path);
        FIXTURE.with(|state| {
            let state = state.borrow();
            let bytes = if let Some(bytes) = state.files.get(path) {
                bytes.clone()
            } else if state.directories.contains(&path.to_owned()) {
                Vec::new()
            } else {
                return Err(missing());
            };
            Ok(Self {
                path: path.to_owned(),
                reader: Cursor::new(bytes),
                writable: false,
            })
        })
    }
    pub fn metadata(&self) -> io::Result<Metadata> {
        metadata(&self.path)
    }
}
/// Appends to the file's contents, failing when the fixture says so.
impl Write for File {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        FIXTURE.with(|state| {
            let mut state = state.borrow_mut();
            if state.write_failure {
                return Err(missing());
            }
            let contents = state.files.get_mut(&self.path).ok_or_else(missing)?;
            contents.extend_from_slice(bytes);
            Ok(bytes.len())
        })
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
impl Read for File {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if FIXTURE.with(|state| state.borrow().read_failure) {
            return Err(missing());
        }
        let count = self.reader.read(bytes)?;
        FIXTURE.with(|state| state.borrow_mut().reads += count);
        Ok(count)
    }
}
