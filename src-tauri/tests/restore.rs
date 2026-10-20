//! Restore checks a copy of the chosen backup in the data folder, as untrusted
//! input, before anything changes
//! ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
use astral_index::desktop::{
    Failure,
    restore::{hold_copy, put_in_place},
};
use astral_index::storage::{MAX_DATABASE_BYTES, Refusal, Store};
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const PAGE: &[u8] = include_bytes!("fixtures/hsr-api/page.json");
static NEXT: AtomicU64 = AtomicU64::new(0);

/// A folder of its own for each test, with a data folder inside, removed afterwards.
struct Folder(PathBuf);
impl Folder {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "astral-index-restore-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(path.join("data")).unwrap();
        Self(path)
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn data(&self) -> PathBuf {
        self.path("data")
    }
}
impl Drop for Folder {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

/// The names in a folder, sorted.
fn names(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn a_backup_is_copied_into_the_data_folder_checked_and_read_there() {
    let folder = Folder::new();
    let mut store = Store::open(&folder.path("history.sqlite")).unwrap();
    let preview = store
        .preview("100000002", "synthetic-server", &[PAGE])
        .unwrap();
    store.commit(preview, 1234).unwrap();
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    let before = std::fs::read(&backup).unwrap();
    let (copy, contents) = hold_copy(&folder.data(), &backup).unwrap();
    assert_eq!(contents, store.contents().unwrap());
    assert_eq!(contents.accounts[0].rolls, 2);
    // The copy sits in the data folder, alone; the backup is untouched.
    assert_eq!(copy, folder.data().join("restore.sqlite.partial"));
    assert_eq!(names(&folder.data()), ["restore.sqlite.partial"]);
    assert_eq!(std::fs::read(&copy).unwrap(), before);
    assert_eq!(std::fs::read(&backup).unwrap(), before);
}

#[test]
fn a_refused_backup_leaves_nothing_in_the_data_folder() {
    let folder = Folder::new();
    let text = folder.path("notes.sqlite");
    std::fs::write(&text, b"not a database, just some text that is long enough").unwrap();
    assert_eq!(
        hold_copy(&folder.data(), &text),
        Err(Failure::RestoreRefused(Refusal::NotDatabase))
    );
    // A sparse file over the bound is refused before it is copied.
    let large = folder.path("large.sqlite");
    std::fs::File::create(&large)
        .unwrap()
        .set_len(MAX_DATABASE_BYTES + 1)
        .unwrap();
    assert_eq!(
        hold_copy(&folder.data(), &large),
        Err(Failure::RestoreRefused(Refusal::TooLarge))
    );
    assert_eq!(
        hold_copy(&folder.data(), &folder.path("missing.sqlite")),
        Err(Failure::RestoreRefused(Refusal::Unreadable))
    );
    assert_eq!(names(&folder.data()), Vec::<String>::new());
}

#[test]
fn a_held_copy_takes_the_history_s_place_after_a_safety_copy() {
    let folder = Folder::new();
    let history = folder.data().join("history.sqlite");
    // The backup holds one import; the history, made later, holds nothing.
    let backup = folder.path("backup.sqlite");
    {
        let mut store = Store::open(&folder.path("source.sqlite")).unwrap();
        let preview = store
            .preview("100000002", "synthetic-server", &[PAGE])
            .unwrap();
        store.commit(preview, 1234).unwrap();
        store.write_snapshot(&backup).unwrap();
    }
    let current = Store::open(&history).unwrap().contents().unwrap();
    let before = std::fs::read(&history).unwrap();
    let (copy, contents) = hold_copy(&folder.data(), &backup).unwrap();
    let restored = put_in_place(
        &history,
        &copy,
        Some("history-before-restore-20261020-143000.sqlite".into()),
    )
    .unwrap();
    assert_eq!(
        restored.safety_copy.as_deref(),
        Some("history-before-restore-20261020-143000.sqlite")
    );
    // The history now holds the backup's rolls, the safety copy the history's.
    assert_eq!(
        names(&folder.data()),
        [
            "history-before-restore-20261020-143000.sqlite",
            "history.sqlite"
        ]
    );
    assert_eq!(Store::open(&history).unwrap().contents().unwrap(), contents);
    let kept = folder
        .data()
        .join("history-before-restore-20261020-143000.sqlite");
    assert_eq!(std::fs::read(&kept).unwrap(), before);
    assert_eq!(Store::open(&kept).unwrap().contents().unwrap(), current);
}
