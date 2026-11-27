//! The Export screen's commands (feature 0055): a UIGF file of the saved Star Rail
//! history, saved where the user chooses in a dialog the Rust side opens, so no
//! command takes a path from the webview, and UIGF's standard opened on request.
//! Neither contacts HoYoverse. What an export did names accounts, so it is never
//! logged.
use super::{
    AccountKey, Failure,
    database::Database,
    dialogs::{Dialogs, SaveDialog, file_name, save_as},
    local_time,
    opener::{Opener, Target, open},
    replacing_file::{ReplacingFile, in_data_folder},
};
use crate::file_export::{self, Export, ExportedAccount, Refusal};
use crate::storage::Chosen;
#[cfg(test)]
use crate::tests::filesystem as fs;
use crate::uigf;
use chrono::{DateTime, FixedOffset};
use serde::Serialize;
#[cfg(not(test))]
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

/// The file in which the mock debug binary's tests name where an export is saved;
/// without it, the save dialog counts as cancelled.
pub const ANSWER: &str = "export-as.txt";

/// What became of an export.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Saved {
    /// Saved under this file name, its folder not sent back, with what the export
    /// did with each account.
    Saved {
        name: String,
        accounts: Vec<ExportedAccount>,
    },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The suggested file name for an export made at the local time `now`: its day.
fn suggested_name(now: chrono::NaiveDateTime) -> String {
    format!("Astral-Index-UIGF-{}.json", now.format("%Y-%m-%d"))
}

/// Export's save dialog.
const DIALOG: SaveDialog = SaveDialog {
    answer: ANSWER,
    filter: "UIGF file",
    extension: "json",
    failure: Failure::ExportFailed,
};

/// Why `file_export` made no file, as the webview is told.
fn refused(refusal: Refusal) -> Failure {
    match refusal {
        Refusal::NothingToExport(accounts) => Failure::NothingToExport(accounts),
        Refusal::Invalid => Failure::ExportInvalid,
    }
}

/// The UIGF file of `account`'s saved history, or of every saved account's, from
/// Astral Index `app_version` at `exported_at`, in seconds since the Unix epoch.
/// An account named past what a read accepts is refused before the history is
/// opened. A roll whose stored payload is not JSON fails the read as a storage
/// failure, not damaged history, as the read sorts by its fields. The file is made
/// and checked off the async workers, after the read, as a large history takes a
/// while.
pub async fn prepare(
    database: &Database,
    account: Option<AccountKey>,
    app_version: String,
    exported_at: i64,
) -> Result<Export, Failure> {
    if account.as_ref().is_some_and(|key| !key.fits()) {
        return Err(Failure::InvalidRequest);
    }
    let built = database
        .run(move |store| {
            let histories = store.histories(match &account {
                Some(key) => Chosen::One {
                    uid: &key.uid,
                    server: &key.server,
                },
                None => Chosen::All,
            })?;
            let schema = uigf::schema();
            Ok(file_export::build(
                &histories,
                &app_version,
                exported_at,
                &schema,
            ))
        })
        .await
        .and_then(|read| read)
        .map_err(Failure::from)?;
    built.map_err(refused)
}

/// Save `export` at `target`: it is written to a temporary file beside it, flushed,
/// then given the target's name, so a failure leaves nothing half-written and
/// removes the temporary file, and only that file. A target in the database's data
/// folder is refused.
pub fn save_to(database: &Database, target: &Path, export: Export) -> Result<Saved, Failure> {
    let name = file_name(target, Failure::ExportFailed)?;
    if in_data_folder(database.folder(), target) {
        return Err(Failure::ExportInDataFolder);
    }
    let file = ReplacingFile::claim(target).map_err(|_| Failure::ExportFailed)?;
    fs::write(file.path(), &export.bytes)
        .and_then(|()| file.publish())
        .map_err(|_| Failure::ExportFailed)?;
    Ok(Saved::Saved {
        name,
        accounts: export.accounts,
    })
}

/// Make the export at `now`, refusing one with nothing to export before any dialog
/// opens, then ask where to save it, suggesting a name from `now`'s local day, and
/// save it there.
async fn export_into<R: Runtime>(
    app: AppHandle<R>,
    dialogs: Dialogs,
    database: &Database,
    account: Option<AccountKey>,
    now: DateTime<FixedOffset>,
) -> Result<Saved, Failure> {
    let version = app.package_info().version.to_string();
    let export = prepare(database, account, version, now.timestamp()).await?;
    let folder = database.folder().map(Path::to_owned);
    let name = suggested_name(now.naive_local());
    match save_as(app, dialogs, folder, DIALOG, name).await? {
        Some(target) => save_to(database, &target, export),
        None => Ok(Saved::Cancelled),
    }
}

/// Exports the saved Star Rail history, or `account`'s, as a UIGF file where the
/// user chooses; never contacts HoYoverse.
#[tauri::command]
pub async fn export_uigf<R: Runtime>(
    app: AppHandle<R>,
    dialogs: State<'_, Dialogs>,
    database: State<'_, Database>,
    account: Option<AccountKey>,
) -> Result<Saved, Failure> {
    export_into(app, *dialogs, &database, account, local_time::moment()).await
}

/// Opens UIGF's standard in the browser, as its certification asks of an exporting app.
#[tauri::command]
pub async fn open_uigf_standard(
    opener: State<'_, Opener>,
    database: State<'_, Database>,
) -> Result<(), Failure> {
    open(&opener, database.folder(), Target::Standard)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::tests::chooser::{self, Asked, FilePath, Fixture as Answers};
    use crate::hsr::Roll;
    use crate::storage::tests::database::{self as sql, Reply, Step};
    use crate::storage::tests::{
        SERVER, UID, ending_at, histories_script, history_row, rolls_of, setup, step, text,
    };
    use crate::tests::filesystem::{self, Fixture as Files, has, removed_files, renamed};
    use crate::uigf::Exported;
    use rusqlite::types::Value;
    use serde_json::json;
    use std::path::PathBuf;
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

    const NAME: &str = "Astral-Index-UIGF-2026-11-27.json";
    /// The moment an export is made at in the tests, `when()`.
    const EXPORTED_AT: i64 = 1_795_795_170;
    /// 2026-11-27 23:59:30 at UTC+8, late on the local day the name carries.
    fn when() -> DateTime<FixedOffset> {
        chrono::DateTime::parse_from_rfc3339("2026-11-27T23:59:30+08:00").unwrap()
    }

    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    fn app() -> AppHandle<MockRuntime> {
        mock_builder()
            .build(mock_context(noop_assets()))
            .unwrap()
            .handle()
            .clone()
    }
    fn folder() -> PathBuf {
        PathBuf::from("/data/astral-index")
    }
    fn target() -> PathBuf {
        PathBuf::from("/exports").join(NAME)
    }
    /// The temporary name an export writes first, built from the target as the
    /// platform joins it.
    fn partial() -> PathBuf {
        let mut name = target().into_os_string();
        name.push(".partial");
        PathBuf::from(name)
    }
    fn database() -> Database {
        Database::new(Some(folder()))
    }
    fn key(uid: &str, server: &str) -> Option<AccountKey> {
        Some(AccountKey {
            uid: uid.into(),
            server: server.into(),
        })
    }
    /// The SQL for opening the database.
    fn opening() -> Vec<Step> {
        let mut steps = vec![step(
            "OPEN",
            vec![text(&folder().join("history.sqlite").to_string_lossy())],
            Reply::Done,
        )];
        steps.extend(setup(true));
        steps
    }
    /// The SQL for opening the database and reading the histories `chosen` binds,
    /// answered with `rolls` in an account with time zone `timezone`.
    fn reading(chosen: [Value; 2], timezone: Option<i32>, rolls: &[Roll]) -> Vec<Step> {
        let rows = rolls
            .iter()
            .map(|roll| history_row(UID, SERVER, timezone, roll))
            .collect();
        let mut steps = opening();
        steps.extend(histories_script(chosen, rows));
        steps
    }
    fn one() -> [Value; 2] {
        [text(UID), text(SERVER)]
    }
    fn written(rolls: usize) -> ExportedAccount {
        ExportedAccount {
            uid: UID.into(),
            server: SERVER.into(),
            outcome: Exported::Rolls {
                written: rolls,
                without_pool_id: 0,
            },
        }
    }
    /// The export of the fixture page's rolls, read from scripted SQL.
    fn export() -> Export {
        sql::expect(reading(one(), Some(8), &rolls_of(UID)));
        let export = run(prepare(
            &database(),
            key(UID, SERVER),
            "1.3.0".into(),
            EXPORTED_AT,
        ))
        .unwrap();
        sql::finish();
        export
    }
    fn document(bytes: &[u8]) -> serde_json::Value {
        serde_json::from_slice(bytes).unwrap()
    }
    fn asked() -> Vec<Asked> {
        chooser::inspect(|state| state.asked.clone())
    }

    #[test]
    fn the_suggested_name_carries_the_local_day() {
        assert_eq!(suggested_name(when().naive_local()), NAME);
    }

    #[test]
    fn the_chosen_accounts_saved_history_becomes_a_uigf_file() {
        let export = export();
        assert_eq!(export.accounts, [written(2)]);
        let document = document(&export.bytes);
        assert_eq!(document["info"]["export_app"], json!("Astral Index"));
        assert_eq!(document["info"]["export_app_version"], json!("1.3.0"));
        assert_eq!(document["info"]["export_timestamp"], json!(EXPORTED_AT));
        let file = uigf::read(&export.bytes).unwrap();
        let rolls = &file.accounts[0].history.as_ref().unwrap().rolls;
        assert_eq!(rolls, &rolls_of(UID));
        // Without an account named, every saved account is read.
        sql::expect(reading([Value::Null, Value::Null], Some(8), &rolls_of(UID)));
        let all = run(prepare(&database(), None, "1.3.0".into(), EXPORTED_AT)).unwrap();
        sql::finish();
        assert_eq!(all, export);
    }

    #[test]
    fn an_export_with_nothing_to_write_says_what_was_left_out() {
        // An account without a time zone is left out, as UIGF requires one.
        sql::expect(reading(one(), None, &rolls_of(UID)));
        let left_out = ExportedAccount {
            outcome: Exported::NoTimezone,
            ..written(0)
        };
        assert_eq!(
            run(prepare(
                &database(),
                key(UID, SERVER),
                "1.3.0".into(),
                EXPORTED_AT
            )),
            Err(Failure::NothingToExport(vec![left_out]))
        );
        sql::finish();
        // An account that isn't saved has no history to export.
        sql::expect(reading(one(), Some(8), &[]));
        assert_eq!(
            run(prepare(
                &database(),
                key(UID, SERVER),
                "1.3.0".into(),
                EXPORTED_AT
            )),
            Err(Failure::NothingToExport(vec![]))
        );
        sql::finish();
        assert_eq!(refused(Refusal::Invalid), Failure::ExportInvalid);
    }

    #[test]
    fn an_unreadable_history_or_an_overlong_account_is_refused() {
        // A read that fails, such as one meeting a payload that is not JSON.
        let steps = reading(one(), Some(8), &[]);
        let read = steps.last().unwrap().sql.clone();
        sql::expect(ending_at(steps, &read, Err(rusqlite::Error::InvalidQuery)));
        assert_eq!(
            run(prepare(
                &database(),
                key(UID, SERVER),
                "1.3.0".into(),
                EXPORTED_AT
            )),
            Err(Failure::Storage)
        );
        sql::finish();
        let copy = Some("history-v2-20261021-143000.sqlite".to_owned());
        let database = Database::not_upgraded(folder(), copy.clone());
        assert_eq!(
            run(prepare(&database, None, "1.3.0".into(), EXPORTED_AT)),
            Err(Failure::HistoryNotUpgraded(copy))
        );
        // Nothing is opened for an account no read accepts.
        let long = "1".repeat(65);
        for account in [key(&long, SERVER), key(UID, ""), key("", SERVER)] {
            sql::expect(vec![]);
            assert_eq!(
                run(prepare(
                    &Database::new(Some(folder())),
                    account,
                    "1.3.0".into(),
                    EXPORTED_AT
                )),
                Err(Failure::InvalidRequest)
            );
            sql::finish();
        }
    }

    #[test]
    fn an_export_is_flushed_beside_the_target_then_takes_its_name() {
        let export = export();
        let bytes = export.bytes.clone();
        filesystem::install(Files::default());
        assert_eq!(
            save_to(&database(), &target(), export),
            Ok(Saved::Saved {
                name: NAME.into(),
                accounts: vec![written(2)],
            })
        );
        filesystem::inspect(|state| {
            assert_eq!(state.synced, [partial()]);
            assert_eq!(state.files.get(&target()), Some(&bytes));
        });
        assert_eq!(renamed(), [(partial(), target())]);
        assert!(removed_files().is_empty());
    }

    #[test]
    fn a_failed_write_leaves_no_partial_file() {
        // Nothing can be claimed beside the target, so nothing is removed either.
        filesystem::install(Files {
            directories: vec![partial()],
            ..Default::default()
        });
        assert_eq!(
            save_to(&database(), &target(), export()),
            Err(Failure::ExportFailed)
        );
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
        // The file cannot be written, or flushed.
        for failing in [
            Files {
                write_failure: true,
                ..Default::default()
            },
            Files {
                sync_failure: true,
                ..Default::default()
            },
        ] {
            filesystem::install(failing);
            assert_eq!(
                save_to(&database(), &target(), export()),
                Err(Failure::ExportFailed)
            );
            assert_eq!(removed_files(), [partial()]);
            assert!(!has(&partial()));
            assert!(!has(&target()));
            assert_eq!(renamed(), []);
        }
    }

    #[test]
    fn an_export_is_never_saved_in_the_data_folder() {
        for target in [
            folder().join("history.sqlite"),
            folder().join("old").join(NAME),
        ] {
            // Whether or not the folders can be resolved, nothing is written.
            for directories in [vec![], vec![folder(), folder().join("old")]] {
                let export = export();
                filesystem::install(Files {
                    directories,
                    ..Default::default()
                });
                assert_eq!(
                    save_to(&database(), &target, export),
                    Err(Failure::ExportInDataFolder),
                    "{}",
                    target.display()
                );
                filesystem::inspect(|state| assert!(state.accessed.is_empty()));
            }
        }
        // A target without a file name is refused before anything is written.
        let export = export();
        filesystem::install(Files::default());
        assert_eq!(
            save_to(&database(), Path::new("/"), export),
            Err(Failure::ExportFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    /// Export through the save dialog's test double, reading the fixture page's
    /// rolls in an account with time zone `timezone`.
    fn export_through(answers: Answers, timezone: Option<i32>) -> Result<Saved, Failure> {
        chooser::install(answers);
        filesystem::install(Files::default());
        sql::expect(reading(one(), timezone, &rolls_of(UID)));
        let saved = run(export_into(
            app(),
            Dialogs::System,
            &database(),
            key(UID, SERVER),
            when(),
        ));
        sql::finish();
        saved
    }

    #[test]
    fn exporting_asks_where_then_saves_or_does_nothing_when_cancelled() {
        // Nothing to export is refused before the dialog opens.
        let saved = export_through(Answers::default(), None);
        assert!(
            matches!(saved, Err(Failure::NothingToExport(_))),
            "{saved:?}"
        );
        assert_eq!(asked(), []);
        // Cancelling writes nothing.
        assert_eq!(
            export_through(Answers::default(), Some(8)),
            Ok(Saved::Cancelled)
        );
        // The dialog suggests the day's name and offers UIGF files.
        assert_eq!(
            asked(),
            [Asked {
                opening: false,
                file_name: NAME.into(),
                filter: "UIGF file".into(),
                extensions: vec!["json".into()],
            }]
        );
        let exports = |state: &Files| {
            state
                .accessed
                .iter()
                .any(|path| path.starts_with("/exports"))
        };
        assert!(!filesystem::inspect(exports));
        // A fault in the dialog fails rather than passing for a cancellation.
        let crash = Answers {
            crash: true,
            ..Default::default()
        };
        assert_eq!(export_through(crash, Some(8)), Err(Failure::ExportFailed));
        // So does a choice that is not a local file.
        let url = Answers {
            answer: Some(FilePath::Url(
                "https://example.com/uigf.json".parse().unwrap(),
            )),
            ..Default::default()
        };
        assert_eq!(export_through(url, Some(8)), Err(Failure::ExportFailed));
        // Choosing a file saves the export there, from this app's version.
        let chosen = Answers {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        };
        assert_eq!(
            export_through(chosen, Some(8)),
            Ok(Saved::Saved {
                name: NAME.into(),
                accounts: vec![written(2)],
            })
        );
        let saved = filesystem::inspect(|state| state.files[&target()].clone());
        // Tauri's mock context's own version.
        assert_eq!(
            document(&saved)["info"]["export_app_version"],
            json!("0.1.0")
        );
        assert_eq!(
            document(&saved)["info"]["export_timestamp"],
            json!(EXPORTED_AT)
        );
    }

    #[test]
    fn outcomes_and_refusals_reach_the_webview_as_kinds() {
        let saved = Saved::Saved {
            name: NAME.into(),
            accounts: vec![written(2)],
        };
        let account = json!({
            "uid": UID,
            "server": SERVER,
            "outcome": { "kind": "rolls", "written": 2, "without_pool_id": 0 },
        });
        assert_eq!(
            serde_json::to_value(saved).unwrap(),
            json!({ "kind": "saved", "name": NAME, "accounts": [account] })
        );
        assert_eq!(
            serde_json::to_value(Saved::Cancelled).unwrap(),
            json!({ "kind": "cancelled" })
        );
        let left_out = |outcome| ExportedAccount {
            outcome,
            ..written(0)
        };
        let nothing = Failure::NothingToExport(vec![
            left_out(Exported::NoTimezone),
            left_out(Exported::RepeatedUid),
        ]);
        assert_eq!(
            serde_json::to_value(nothing).unwrap(),
            json!({
                "kind": "nothing_to_export",
                "code": [
                    { "uid": UID, "server": SERVER, "outcome": { "kind": "no_timezone" } },
                    { "uid": UID, "server": SERVER, "outcome": { "kind": "repeated_uid" } },
                ],
            })
        );
        for (failure, kind) in [
            (Failure::ExportInvalid, "export_invalid"),
            (Failure::ExportFailed, "export_failed"),
            (Failure::ExportInDataFolder, "export_in_data_folder"),
        ] {
            assert_eq!(
                serde_json::to_value(failure).unwrap(),
                json!({ "kind": kind })
            );
        }
    }
}
