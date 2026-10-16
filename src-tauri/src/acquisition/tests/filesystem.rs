//! In-memory filesystem double. Unit tests never call the host filesystem.
use std::{
    cell::RefCell,
    collections::BTreeMap,
    ffi::OsString,
    io::{self, Cursor, Read},
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
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        state.removed_files.push(path.to_owned());
        state.files.remove(path).map(drop).ok_or_else(missing)
    })
}
/// Moves a file's contents to `to`, unless a folder occupies `to`. The source may
/// be a file SQLite wrote, which this double never sees, so it need not exist here.
pub fn rename(from: impl AsRef<Path>, to: impl AsRef<Path>) -> io::Result<()> {
    let (from, to) = (from.as_ref(), to.as_ref());
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        state.renamed.push((from.to_owned(), to.to_owned()));
        if state.directories.contains(&to.to_owned()) {
            return Err(io::Error::new(
                io::ErrorKind::IsADirectory,
                "synthetic folder",
            ));
        }
        let contents = state.files.remove(from).unwrap_or_default();
        state.files.insert(to.to_owned(), contents);
        Ok(())
    })
}
/// A folder's real path: itself if it exists here, else a failure.
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
pub struct Metadata(bool);
impl Metadata {
    pub fn is_file(&self) -> bool {
        self.0
    }
    pub fn is_dir(&self) -> bool {
        !self.0
    }
}
pub fn metadata(path: &Path) -> io::Result<Metadata> {
    access(path);
    FIXTURE.with(|state| {
        let state = state.borrow();
        if state.metadata_failure {
            return Err(missing());
        }
        if state.files.contains_key(path) {
            Ok(Metadata(true))
        } else if state.directories.contains(&path.to_owned()) {
            Ok(Metadata(false))
        } else {
            Err(missing())
        }
    })
}
pub struct File {
    path: PathBuf,
    reader: Cursor<Vec<u8>>,
}
pub struct OpenOptions {
    read: bool,
    flags: i32,
}
impl OpenOptions {
    pub fn new() -> Self {
        Self {
            read: false,
            flags: 0,
        }
    }
    pub fn read(&mut self, read: bool) -> &mut Self {
        self.read = read;
        self
    }
    #[cfg(unix)]
    pub fn custom_flags(&mut self, flags: i32) -> &mut Self {
        self.flags = flags;
        self
    }
    pub fn open(&self, path: &Path) -> io::Result<File> {
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
            })
        })
    }
    /// Records the flush, failing when the fixture says so.
    pub fn sync_all(&self) -> io::Result<()> {
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
            })
        })
    }
    pub fn metadata(&self) -> io::Result<Metadata> {
        metadata(&self.path)
    }
}
impl Read for File {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        let count = self.reader.read(bytes)?;
        FIXTURE.with(|state| state.borrow_mut().reads += count);
        Ok(count)
    }
}
