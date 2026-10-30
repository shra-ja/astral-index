//! Backups are snapshots of the real database, checked as restore will check them
//! ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
use astral_index::desktop::{
    Failure,
    backup::{Saved, save_to},
    database::Database,
};
use astral_index::storage::{Error, MAX_DATABASE_BYTES, Refusal, Schema, Store, check_database};
use common::{Folder, SERVER, UID, UPGRADED, names, release_1_0_0, store_with_history};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

mod common;

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
    assert_eq!(check_database(&backup, Schema::CURRENT), Ok(()));
    let restored = Store::open(&backup).unwrap();
    assert_eq!(
        restored.history(UID, SERVER).unwrap(),
        store.history(UID, SERVER).unwrap()
    );
    assert_eq!(restored.accounts().unwrap(), store.accounts().unwrap());
    // Its contents, as the restore confirmation shows them, match the history's.
    let contents = restored.contents().unwrap();
    assert_eq!(contents.accounts[0].rolls, 2);
    assert_eq!(contents.last_import.as_ref().unwrap().inserted, 2);
    assert_eq!(contents, store.contents().unwrap());
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
    let fixture = release_1_0_0();
    let before = std::fs::read(&fixture).unwrap();
    assert_eq!(check_database(&fixture, Schema::CURRENT), Ok(()));
    assert_eq!(std::fs::read(&fixture).unwrap(), before);
}

#[test]
fn files_that_are_not_databases_are_refused_as_such() {
    let folder = Folder::new();
    let text = folder.path("notes.txt");
    std::fs::write(&text, b"not a database, just some text that is long enough").unwrap();
    assert_eq!(
        check_database(&text, Schema::CURRENT),
        Err(Refusal::NotDatabase)
    );
    let empty = folder.path("empty.sqlite");
    std::fs::write(&empty, b"").unwrap();
    assert_eq!(
        check_database(&empty, Schema::CURRENT),
        Err(Refusal::NotDatabase)
    );
    // A missing file is never created by checking it.
    let missing = folder.path("missing.sqlite");
    assert_eq!(
        check_database(&missing, Schema::CURRENT),
        Err(Refusal::Unreadable)
    );
    assert!(!missing.exists());
}

#[test]
fn a_file_over_the_bound_is_refused_without_being_read() {
    let folder = Folder::new();
    // A sparse file: as large as the bound allows, then one byte more.
    let large = folder.path("large.sqlite");
    let file = std::fs::File::create(&large).unwrap();
    file.set_len(MAX_DATABASE_BYTES + 1).unwrap();
    assert_eq!(
        check_database(&large, Schema::CURRENT),
        Err(Refusal::TooLarge)
    );
}

#[test]
fn another_apps_or_a_newer_versions_database_is_refused_as_such() {
    let folder = Folder::new();
    let other = folder.path("other.sqlite");
    Connection::open(&other)
        .unwrap()
        .execute_batch("CREATE TABLE notes(text TEXT);")
        .unwrap();
    assert_eq!(
        check_database(&other, Schema::CURRENT),
        Err(Refusal::OtherApp)
    );
    let newer = snapshot(&folder);
    Connection::open(&newer)
        .unwrap()
        .execute_batch("PRAGMA user_version = 4;")
        .unwrap();
    assert_eq!(check_database(&newer, Schema::CURRENT), Err(Refusal::Newer));
}

#[test]
fn a_changed_schema_is_damage() {
    let folder = Folder::new();
    let backup = snapshot(&folder);
    Connection::open(&backup)
        .unwrap()
        .execute_batch("CREATE TABLE extra(value TEXT);")
        .unwrap();
    assert_eq!(
        check_database(&backup, Schema::CURRENT),
        Err(Refusal::Damaged)
    );
}

#[test]
fn a_damaged_database_is_refused_as_damaged() {
    let folder = Folder::new();
    let backup = snapshot(&folder);
    // Overwrite the last page, which holds stored rolls, leaving the header and
    // schema readable.
    let mut bytes = std::fs::read(&backup).unwrap();
    let page = usize::from(u16::from_be_bytes([bytes[16], bytes[17]]));
    let start = bytes.len() - page;
    bytes[start..].fill(0xA5);
    std::fs::write(&backup, &bytes).unwrap();
    assert_eq!(
        check_database(&backup, Schema::CURRENT),
        Err(Refusal::Damaged)
    );
}

/// Save a backup of the history in `data` to `target`, as the command does.
fn save(data: &Path, target: &Path) -> Result<Saved, Failure> {
    let database = Database::new(Some(data.to_owned()));
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(save_to(&database, target))
}
/// A data folder holding the synthetic page's history, closed again.
fn data_with_history(folder: &Folder) -> PathBuf {
    let data = folder.subfolder("data");
    drop(store_with_history(&data.join("history.sqlite")));
    data
}
#[test]
fn saving_replaces_a_file_the_user_chose_to_replace_with_a_checked_backup() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    let target = folder.path("backup.sqlite");
    std::fs::write(
        &target,
        b"an older file the save dialog confirmed replacing",
    )
    .unwrap();
    assert_eq!(
        save(&data, &target),
        Ok(Saved::Saved {
            name: "backup.sqlite".into()
        })
    );
    assert_eq!(check_database(&target, Schema::CURRENT), Ok(()));
    let saved = Store::open(&target).unwrap();
    assert_eq!(saved.history(UID, SERVER).unwrap().len(), 2);
    // Nothing else was left beside it.
    assert_eq!(names(folder.root()), ["backup.sqlite", "data"]);
}

#[test]
fn a_failed_rename_leaves_no_partial_file_and_the_users_own_files_untouched() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    // A folder in the target's place cannot be replaced by the backup.
    let target = folder.path("backup.sqlite");
    std::fs::create_dir(&target).unwrap();
    // The user's own file with the first temporary name is left alone.
    let own = folder.path("backup.sqlite.partial");
    std::fs::write(&own, b"the user's own file").unwrap();
    assert_eq!(save(&data, &target), Err(Failure::BackupFailed));
    assert_eq!(
        names(folder.root()),
        ["backup.sqlite", "backup.sqlite.partial", "data"]
    );
    assert_eq!(std::fs::read(&own).unwrap(), b"the user's own file");
}

#[test]
fn a_backup_into_the_data_folder_is_refused_and_the_history_left_as_it_was() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    let live = data.join("history.sqlite");
    let before = std::fs::read(&live).unwrap();
    for target in [live.clone(), data.join("copy.sqlite")] {
        assert_eq!(save(&data, &target), Err(Failure::BackupInDataFolder));
    }
    assert_eq!(std::fs::read(&live).unwrap(), before);
    assert_eq!(names(&data), ["history.sqlite"]);
}

#[test]
fn a_history_opened_with_a_newer_schema_is_backed_up_and_checked_against_it() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    let database = Database::with_schema(Some(data), UPGRADED);
    let target = folder.path("backup.sqlite");
    let saved = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(save_to(&database, &target));
    assert!(saved.is_ok(), "{saved:?}");
    assert_eq!(check_database(&target, UPGRADED), Ok(()));
    assert_eq!(
        check_database(&target, Schema::CURRENT),
        Err(Refusal::Newer)
    );
}
