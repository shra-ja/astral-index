//! Exports read the real database and are written beside their target, flushed and
//! renamed into place, which Windows treats differently from Linux (feature 0055).
use astral_index::desktop::{
    AccountKey, Failure,
    database::Database,
    export::{Saved, prepare, save_to},
};
use astral_index::file_export::ExportedAccount;
use astral_index::storage::Store;
use astral_index::uigf::{self, Exported};
use common::{Folder, SERVER, UID, names, rolls, store_with_history};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

mod common;

fn run<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(future)
}
/// A data folder holding the synthetic page's history, closed again.
fn data_with_history(folder: &Folder) -> PathBuf {
    let data = folder.subfolder("data");
    drop(store_with_history(&data.join("history.sqlite")));
    data
}
/// Export the synthetic account's history in `data` to `target`, as the command
/// does once the save dialog has answered.
fn export(data: &Path, target: &Path) -> Result<Saved, Failure> {
    let database = Database::new(Some(data.to_owned()));
    let account = Some(AccountKey {
        uid: UID.into(),
        server: SERVER.into(),
    });
    let export = run(prepare(&database, account, "1.3.0".into(), 1_795_795_170))?;
    save_to(&database, target, export)
}

#[test]
fn an_export_replaces_a_file_the_user_chose_to_replace_and_reads_back() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    let target = folder.path("export.json");
    std::fs::write(
        &target,
        b"an older file the save dialog confirmed replacing",
    )
    .unwrap();
    let account = ExportedAccount {
        uid: UID.into(),
        server: SERVER.into(),
        outcome: Exported::Rolls {
            written: 2,
            without_pool_id: 0,
        },
    };
    assert_eq!(
        export(&data, &target),
        Ok(Saved::Saved {
            name: "export.json".into(),
            accounts: vec![account],
        })
    );
    let file = uigf::read(&std::fs::read(&target).unwrap()).unwrap();
    let store = Store::open(&data.join("history.sqlite")).unwrap();
    assert_eq!(
        file.accounts[0].history.as_ref().unwrap().rolls,
        rolls(&store, UID, SERVER).unwrap()
    );
    // Nothing else was left beside it.
    assert_eq!(names(folder.root()), ["data", "export.json"]);
}

#[test]
fn a_failed_rename_leaves_no_partial_file_and_the_users_own_files_untouched() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    // A folder in the target's place cannot be replaced by the export.
    let target = folder.path("export.json");
    std::fs::create_dir(&target).unwrap();
    // The user's own file with the first temporary name is left alone.
    let own = folder.path("export.json.partial");
    std::fs::write(&own, b"the user's own file").unwrap();
    assert_eq!(export(&data, &target), Err(Failure::ExportFailed));
    assert_eq!(
        names(folder.root()),
        ["data", "export.json", "export.json.partial"]
    );
    assert_eq!(std::fs::read(&own).unwrap(), b"the user's own file");
}

#[test]
fn an_export_into_the_data_folder_is_refused_and_the_history_left_as_it_was() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    let live = data.join("history.sqlite");
    let before = std::fs::read(&live).unwrap();
    for target in [live.clone(), data.join("export.json")] {
        assert_eq!(export(&data, &target), Err(Failure::ExportInDataFolder));
    }
    assert_eq!(std::fs::read(&live).unwrap(), before);
    assert_eq!(names(&data), ["history.sqlite"]);
}

#[test]
fn a_roll_payload_that_is_not_json_fails_the_read_as_storage() {
    let folder = Folder::new();
    let data = data_with_history(&folder);
    // The schema checks each payload is JSON, so only damage, simulated here by
    // writing past that check, leaves one that is not.
    Connection::open(data.join("history.sqlite"))
        .unwrap()
        .execute_batch(
            "PRAGMA ignore_check_constraints = ON; UPDATE rolls SET payload = 'not JSON'",
        )
        .unwrap();
    let target = folder.path("export.json");
    // The read sorts by the payload's fields, so SQLite refuses it before any
    // roll is checked.
    assert_eq!(export(&data, &target), Err(Failure::Storage));
    assert_eq!(names(folder.root()), ["data"]);
}
