//! Backups are snapshots of the real database, checked as restore will check them
//! ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
use astral_index::storage::{Error, Store, check_database};
use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const PAGE: &[u8] = include_bytes!("fixtures/hsr-api/page.json");
const UID: &str = "100000002";
const SERVER: &str = "synthetic-server";
static NEXT: AtomicU64 = AtomicU64::new(0);

/// A folder of its own for each test, removed afterwards.
struct Folder(PathBuf);
impl Folder {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "astral-index-backup-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Folder {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

/// A store holding the synthetic page's rolls.
fn store_with_history(path: &Path) -> Store {
    let mut store = Store::open(path).unwrap();
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    store.commit(preview, 1234).unwrap();
    store
}

/// A snapshot of a store with history, for a check to refuse once changed.
fn snapshot(folder: &Folder) -> PathBuf {
    let store = store_with_history(&folder.path("history.sqlite"));
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    backup
}

#[test]
fn a_snapshot_passes_the_check_and_holds_the_same_history() {
    let folder = Folder::new();
    let store = store_with_history(&folder.path("history.sqlite"));
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    assert_eq!(check_database(&backup), Ok(()));
    let restored = Store::open(&backup).unwrap();
    assert_eq!(
        restored.history(UID, SERVER).unwrap(),
        store.history(UID, SERVER).unwrap()
    );
    assert_eq!(restored.accounts().unwrap(), store.accounts().unwrap());
}

#[test]
fn a_snapshot_never_overwrites_an_existing_file() {
    let folder = Folder::new();
    let store = store_with_history(&folder.path("history.sqlite"));
    let existing = folder.path("existing.sqlite");
    std::fs::write(&existing, b"keep me").unwrap();
    assert_eq!(store.write_snapshot(&existing), Err(Error::Database));
    assert_eq!(std::fs::read(&existing).unwrap(), b"keep me");
}

#[test]
fn the_released_1_0_0_database_passes_the_check_unchanged() {
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/storage/history-1.0.0.sqlite");
    let before = std::fs::read(&fixture).unwrap();
    assert_eq!(check_database(&fixture), Ok(()));
    assert_eq!(std::fs::read(&fixture).unwrap(), before);
}

#[test]
fn files_that_are_not_this_apps_released_databases_fail_the_check() {
    let folder = Folder::new();
    // Not a database at all.
    let text = folder.path("notes.txt");
    std::fs::write(&text, b"not a database, just some text that is long enough").unwrap();
    assert_eq!(check_database(&text), Err(Error::Database));
    // A missing file is never created by checking it.
    let missing = folder.path("missing.sqlite");
    assert_eq!(check_database(&missing), Err(Error::Database));
    assert!(!missing.exists());
    // Another app's database.
    let other = folder.path("other.sqlite");
    Connection::open(&other)
        .unwrap()
        .execute_batch("CREATE TABLE notes(text TEXT);")
        .unwrap();
    assert_eq!(check_database(&other), Err(Error::Schema));
    // This app's database from a newer version.
    let newer = snapshot(&folder);
    Connection::open(&newer)
        .unwrap()
        .execute_batch("PRAGMA user_version = 3;")
        .unwrap();
    assert_eq!(check_database(&newer), Err(Error::Schema));
}

#[test]
fn a_changed_schema_fails_the_check() {
    let folder = Folder::new();
    let backup = snapshot(&folder);
    Connection::open(&backup)
        .unwrap()
        .execute_batch("CREATE TABLE extra(value TEXT);")
        .unwrap();
    assert_eq!(check_database(&backup), Err(Error::Schema));
}

#[test]
fn a_damaged_database_fails_the_check() {
    let folder = Folder::new();
    let backup = snapshot(&folder);
    // Overwrite the last page, which holds stored rolls, leaving the header and
    // schema readable.
    let mut bytes = std::fs::read(&backup).unwrap();
    let page = usize::from(u16::from_be_bytes([bytes[16], bytes[17]]));
    let start = bytes.len() - page;
    bytes[start..].fill(0xA5);
    std::fs::write(&backup, &bytes).unwrap();
    // SQLite cannot read the page at all, so the check fails before its integrity
    // report; the unit tests cover a report that finds damage.
    assert_eq!(check_database(&backup), Err(Error::Database));
}
