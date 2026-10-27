//! Restore checks a copy of the chosen backup in the data folder, as untrusted
//! input, before anything changes
//! ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
use astral_index::desktop::{
    Failure,
    restore::{hold_copy, is_history, put_in_place},
};
use astral_index::storage::{MAX_DATABASE_BYTES, Refusal, Schema, Store};
use common::{
    Folder, PAGE, SERVER, UID, UPGRADED, imports, names, release_1_0_0, store_with_history,
};
use std::path::{Path, PathBuf};

mod common;

#[test]
fn a_backup_is_copied_into_the_data_folder_checked_and_read_there() {
    let folder = Folder::new();
    let data = folder.subfolder("data");
    let store = store_with_history(&folder.path("history.sqlite"));
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    let before = std::fs::read(&backup).unwrap();
    let (copy, contents) = hold_copy(&data, &backup, Schema::CURRENT).unwrap();
    assert_eq!(contents, store.contents().unwrap());
    assert_eq!(contents.accounts[0].rolls, 2);
    // The copy sits in the data folder, alone; the backup is untouched.
    assert_eq!(copy, data.join("restore.sqlite.partial"));
    assert_eq!(names(&data), ["restore.sqlite.partial"]);
    assert_eq!(std::fs::read(&copy).unwrap(), before);
    assert_eq!(std::fs::read(&backup).unwrap(), before);
}

#[test]
fn a_refused_backup_leaves_nothing_in_the_data_folder() {
    let folder = Folder::new();
    let data = folder.subfolder("data");
    let text = folder.path("notes.sqlite");
    std::fs::write(&text, b"not a database, just some text that is long enough").unwrap();
    assert_eq!(
        hold_copy(&data, &text, Schema::CURRENT),
        Err(Failure::RestoreRefused(Refusal::NotDatabase))
    );
    // A sparse file over the bound is refused before it is copied.
    let large = folder.path("large.sqlite");
    std::fs::File::create(&large)
        .unwrap()
        .set_len(MAX_DATABASE_BYTES + 1)
        .unwrap();
    assert_eq!(
        hold_copy(&data, &large, Schema::CURRENT),
        Err(Failure::RestoreRefused(Refusal::TooLarge))
    );
    assert_eq!(
        hold_copy(&data, &folder.path("missing.sqlite"), Schema::CURRENT),
        Err(Failure::RestoreRefused(Refusal::Unreadable))
    );
    assert_eq!(names(&data), Vec::<String>::new());
}

#[test]
fn a_held_copy_takes_the_history_s_place_after_a_safety_copy() {
    let folder = Folder::new();
    let data = folder.subfolder("data");
    let history = data.join("history.sqlite");
    // The backup holds one import; the history, made later, holds nothing.
    let backup = folder.path("backup.sqlite");
    store_with_history(&folder.path("source.sqlite"))
        .write_snapshot(&backup)
        .unwrap();
    let current = Store::open(&history).unwrap().contents().unwrap();
    let before = std::fs::read(&history).unwrap();
    let (copy, contents) = hold_copy(&data, &backup, Schema::CURRENT).unwrap();
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
        names(&data),
        [
            "history-before-restore-20261020-143000.sqlite",
            "history.sqlite"
        ]
    );
    assert_eq!(Store::open(&history).unwrap().contents().unwrap(), contents);
    let kept = data.join("history-before-restore-20261020-143000.sqlite");
    assert_eq!(std::fs::read(&kept).unwrap(), before);
    assert_eq!(Store::open(&kept).unwrap().contents().unwrap(), current);
}

#[test]
fn only_the_history_itself_is_refused_in_any_form_of_its_path() {
    let folder = Folder::new();
    let data = folder.subfolder("data");
    let history = data.join("history.sqlite");
    drop(Store::open(&history).unwrap());
    let safety = data.join("history-before-restore-20261020-143000.sqlite");
    std::fs::copy(&history, &safety).unwrap();
    let elsewhere = folder.path("history.sqlite");
    std::fs::copy(&history, &elsewhere).unwrap();
    assert!(is_history(&history, &history));
    assert!(is_history(
        &history,
        &data.join("..").join("data").join("history.sqlite")
    ));
    // Windows compares names without regard to case.
    #[cfg(windows)]
    assert!(is_history(&history, &data.join("HISTORY.SQLITE")));
    #[cfg(unix)]
    {
        let link = folder.path("link");
        std::os::unix::fs::symlink(&data, &link).unwrap();
        assert!(is_history(&history, &link.join("history.sqlite")));
    }
    assert!(!is_history(&history, &safety));
    assert!(!is_history(&history, &elsewhere));
}

#[test]
fn a_backup_is_upgraded_in_its_held_copy_with_the_schema_it_is_restored_into() {
    let folder = Folder::new();
    let data = folder.subfolder("data");
    let store = store_with_history(&folder.path("history.sqlite"));
    let backup = folder.path("backup.sqlite");
    store.write_snapshot(&backup).unwrap();
    let (copy, contents) = hold_copy(&data, &backup, UPGRADED).unwrap();
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
    let data = folder.subfolder("fresh");
    let history = data.join("history.sqlite");
    drop(Store::open_with(&history, schema, None).unwrap());
    let (copy, _) = hold_copy(&data, backup, schema).unwrap();
    put_in_place(&history, &copy, None).unwrap();
    assert_eq!(names(&data), ["history.sqlite"]);
    history
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
    let data = folder.subfolder("data");
    let history = data.join("history.sqlite");
    let mut store = Store::open(&history).unwrap();
    // Two accounts, the same UID on two servers, and a repeated import.
    let other = std::str::from_utf8(PAGE)
        .unwrap()
        .replace(SERVER, "other-server");
    for (server, page, at) in [
        (SERVER, PAGE, 1234),
        ("other-server", other.as_bytes(), 1300),
        (SERVER, PAGE, 1400),
    ] {
        let preview = store.preview(UID, server, &[page]).unwrap();
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
    let fixture = release_1_0_0();
    let before = std::fs::read(&fixture).unwrap();
    // Under the app's schema, and a later one's, which upgrades the restored copy.
    for schema in [Schema::CURRENT, UPGRADED] {
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
