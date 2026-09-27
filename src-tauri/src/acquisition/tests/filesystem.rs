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
    pub files: BTreeMap<PathBuf, Vec<u8>>,
    pub directories: Vec<PathBuf>,
    pub metadata_failure: bool,
    pub reads: usize,
    pub accessed: Vec<PathBuf>,
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
        state
            .borrow_mut()
            .entries
            .take()
            .map(Vec::into_iter)
            .ok_or_else(missing)
    })
}
pub struct Metadata(bool);
impl Metadata {
    pub fn is_file(&self) -> bool {
        self.0
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
