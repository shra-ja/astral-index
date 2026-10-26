//! Restore checks a copy of the chosen backup in the data folder, as untrusted
//! input, before anything changes
//! ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
use astral_index::desktop::{
    Failure,
    restore::{hold_copy, is_history, put_in_place},
};
use astral_index::storage::{MAX_DATABASE_BYTES, Refusal, Schema, Store};
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
    let (copy, contents) = hold_copy(&folder.data(), &backup, Schema::CURRENT).unwrap();
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
        hold_copy(&folder.data(), &text, Schema::CURRENT),
        Err(Failure::RestoreRefused(Refusal::NotDatabase))
    );
    // A sparse file over the bound is refused before it is copied.
    let large = folder.path("large.sqlite");
    std::fs::File::create(&large)
        .unwrap()
        .set_len(MAX_DATABASE_BYTES + 1)
        .unwrap();
    assert_eq!(
        hold_copy(&folder.data(), &large, Schema::CURRENT),
        Err(Failure::RestoreRefused(Refusal::TooLarge))
    );
    assert_eq!(
        hold_copy(
            &folder.data(),
            &folder.path("missing.sqlite"),
            Schema::CURRENT
        ),
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
    let (copy, contents) = hold_copy(&folder.data(), &backup, Schema::CURRENT).unwrap();
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

#[test]
fn only_the_history_itself_is_refused_in_any_form_of_its_path() {
    let folder = Folder::new();
    let history = folder.data().join("history.sqlite");
    drop(Store::open(&history).unwrap());
    let safety = folder
        .data()
        .join("history-before-restore-20261020-143000.sqlite");
    std::fs::copy(&history, &safety).unwrap();
    let elsewhere = folder.path("history.sqlite");
    std::fs::copy(&history, &elsewhere).unwrap();
    assert!(is_history(&history, &history));
    assert!(is_history(
        &history,
        &folder.data().join("..").join("data").join("history.sqlite")
    ));
    // Windows compares names without regard to case.
    #[cfg(windows)]
    assert!(is_history(&history, &folder.data().join("HISTORY.SQLITE")));
    #[cfg(unix)]
    {
        let link = folder.path("link");
        std::os::unix::fs::symlink(folder.data(), &link).unwrap();
        assert!(is_history(&history, &link.join("history.sqlite")));
    }
    assert!(!is_history(&history, &safety));
    assert!(!is_history(&history, &elsewhere));
}

#[test]
fn a_backup_is_upgraded_in_its_held_copy_with_the_schema_it_is_restored_into() {
    let upgraded = Schema::with_migrations(&["ALTER TABLE rolls ADD COLUMN banner TEXT"]);
    let folder = Folder::new();
    let mut store = Store::open(&folder.path("history.sqlite")).unwrap();
    let preview = store
        .preview("100000002", "synthetic-server", &[PAGE])
        .unwrap();
    store.commit(preview, 1234).unwrap();
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    let (copy, contents) = hold_copy(&folder.data(), &backup, upgraded).unwrap();
    assert_eq!(contents, store.contents().unwrap());
    let version: i32 = rusqlite::Connection::open(&copy)
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 3);
}

/// Restore `backup` into a fresh profile's data folder, where the app has just made
/// an empty history, and return the history it leaves there.
fn restore_into_fresh_profile(folder: &Folder, backup: &Path, schema: Schema) -> PathBuf {
    let data = folder.path("fresh");
    std::fs::create_dir(&data).unwrap();
    let history = data.join("history.sqlite");
    drop(Store::open_with(&history, schema, None).unwrap());
    let (copy, _) = hold_copy(&data, backup, schema).unwrap();
    put_in_place(&history, &copy, None).unwrap();
    assert_eq!(names(&data), ["history.sqlite"]);
    history
}

/// Every import's account and counts, in order.
fn imports(history: &Path) -> Vec<(String, String, i64, i64, i64)> {
    let connection = rusqlite::Connection::open(history).unwrap();
    let mut batches = connection
        .prepare("SELECT uid,server,imported_at,inserted,duplicates FROM batches ORDER BY id")
        .unwrap();
    batches
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

/// The restored history holds the original's accounts, every account's rolls and
/// every import.
fn assert_same_history(restored: &Path, original: &Path, schema: Schema) {
    let restored_store = Store::open_with(restored, schema, None).unwrap();
    let original_store = Store::open_with(original, schema, None).unwrap();
    let contents = original_store.contents().unwrap();
    assert_eq!(restored_store.contents().unwrap(), contents);
    for account in &contents.accounts {
        assert_eq!(
            restored_store
                .history(&account.uid, &account.server)
                .unwrap(),
            original_store
                .history(&account.uid, &account.server)
                .unwrap()
        );
    }
    assert_eq!(imports(restored), imports(original));
}

#[test]
fn a_backup_restores_into_a_fresh_profile_with_the_same_accounts_rolls_and_imports() {
    let folder = Folder::new();
    let history = folder.data().join("history.sqlite");
    let mut store = Store::open(&history).unwrap();
    // Two accounts, the same UID on two servers, and a repeated import.
    let other = std::str::from_utf8(PAGE)
        .unwrap()
        .replace("synthetic-server", "other-server");
    for (server, page, at) in [
        ("synthetic-server", PAGE, 1234),
        ("other-server", other.as_bytes(), 1300),
        ("synthetic-server", PAGE, 1400),
    ] {
        let preview = store.preview("100000002", server, &[page]).unwrap();
        store.commit(preview, at).unwrap();
    }
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    drop(store);
    let restored = restore_into_fresh_profile(&folder, &backup, Schema::CURRENT);
    assert_eq!(imports(&restored).len(), 3);
    assert_same_history(&restored, &history, Schema::CURRENT);
}

#[test]
fn the_1_0_0_fixture_restores_as_a_backup_into_a_fresh_profile() {
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/storage/history-1.0.0.sqlite");
    let before = std::fs::read(&fixture).unwrap();
    let upgraded = Schema::with_migrations(&["ALTER TABLE rolls ADD COLUMN banner TEXT"]);
    // Under the app's schema, and a later one's, which upgrades the restored copy.
    for schema in [Schema::CURRENT, upgraded] {
        let folder = Folder::new();
        let restored = restore_into_fresh_profile(&folder, &fixture, schema);
        // Compared with a copy of the fixture, opened under the same schema.
        let original = folder.path("original.sqlite");
        std::fs::copy(&fixture, &original).unwrap();
        assert_same_history(&restored, &original, schema);
        let contents = Store::open_with(&restored, schema, None)
            .unwrap()
            .contents()
            .unwrap();
        assert_eq!(contents.accounts.len(), 3);
        assert_eq!(imports(&restored).len(), 4);
    }
    assert_eq!(std::fs::read(&fixture).unwrap(), before);
}
