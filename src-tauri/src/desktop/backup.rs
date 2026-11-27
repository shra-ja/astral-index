//! The Backup & Restore screen's commands
//! ([decision 0031](../../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
//! Files are chosen in dialogs the Rust side opens, so no command takes a path from
//! the webview.
use super::{
    Failure,
    database::Database,
    dialogs::{Dialogs, SaveDialog, file_name, save_as},
    local_time,
    replacing_file::{ReplacingFile, in_data_folder},
};
use crate::storage::check_database;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

/// The file in which the mock debug binary's tests name where a backup is saved;
/// without it, the save dialog counts as cancelled.
pub const ANSWER: &str = "save-as.txt";

/// What became of a backup.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Saved {
    /// Saved under this file name; its folder is not sent back.
    Saved { name: String },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The suggested file name for a backup made at the local time `now`: its day.
fn suggested_name(now: chrono::NaiveDateTime) -> String {
    format!("Astral-Index-backup-{}.sqlite", now.format("%Y-%m-%d"))
}

/// Backup's save dialog.
const DIALOG: SaveDialog = SaveDialog {
    answer: ANSWER,
    filter: "Astral Index backup",
    extension: "sqlite",
    failure: Failure::BackupFailed,
};

/// Write a snapshot of the history to `written` and check it as restore would.
async fn write_checked(database: &Database, written: &Path) -> Result<(), Failure> {
    let (snapshot, schema) = (written.to_owned(), database.schema());
    database
        .run(move |store| {
            store
                .write_snapshot(&snapshot)
                .map_err(|_| Failure::BackupFailed)?;
            check_database(&snapshot, schema).map_err(|_| Failure::HistoryDamaged)
        })
        .await
        .map_err(Failure::from)?
}

/// Write a checked backup to `target`: a snapshot goes to a temporary file beside
/// it, is checked and flushed, then takes the target's name. Any failure removes
/// the temporary file, and only that file, so nothing is left half-written. A
/// target in the database's data folder is refused.
pub async fn save_to(database: &Database, target: &Path) -> Result<Saved, Failure> {
    let name = file_name(target, Failure::BackupFailed)?;
    if in_data_folder(database.folder(), target) {
        return Err(Failure::BackupInDataFolder);
    }
    let file = ReplacingFile::claim(target).map_err(|_| Failure::BackupFailed)?;
    write_checked(database, file.path()).await?;
    file.publish().map_err(|_| Failure::BackupFailed)?;
    Ok(Saved::Saved { name })
}

/// Ask where to save, suggesting a name from the local time `now`, off the async
/// workers as the dialog blocks, then save a checked backup there.
async fn save_into<R: Runtime>(
    app: AppHandle<R>,
    dialogs: Dialogs,
    database: &Database,
    now: chrono::NaiveDateTime,
) -> Result<Saved, Failure> {
    let folder = database.folder().map(Path::to_owned);
    match save_as(app, dialogs, folder, DIALOG, suggested_name(now)).await? {
        Some(target) => save_to(database, &target).await,
        None => Ok(Saved::Cancelled),
    }
}

/// Saves a backup where the user chooses; never contacts HoYoverse.
#[tauri::command]
pub async fn save_backup<R: Runtime>(
    app: AppHandle<R>,
    dialogs: State<'_, Dialogs>,
    database: State<'_, Database>,
) -> Result<Saved, Failure> {
    save_into(app, *dialogs, &database, local_time::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::tests::chooser::{self, Asked, FilePath, Fixture as Answers};
    use crate::storage::tests::database::{self as sql, Reply, Step};
    use crate::storage::tests::{VACUUM, check_script, ending_at, setup, step, text};
    use crate::tests::filesystem::{self, Fixture as Files, has, removed_files, renamed};
    use std::path::PathBuf;
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

    const NAME: &str = "Astral-Index-backup-2026-10-16.sqlite";
    /// The local time a backup is made at in the tests.
    fn when() -> chrono::NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 16)
            .unwrap()
            .and_hms_opt(23, 59, 30)
            .unwrap()
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
    fn backups() -> PathBuf {
        PathBuf::from("/backups")
    }
    fn target() -> PathBuf {
        backups().join(NAME)
    }
    /// The temporary name a save writes first, built from the target as the
    /// platform joins it.
    fn partial() -> PathBuf {
        let mut name = target().into_os_string();
        name.push(".partial");
        PathBuf::from(name)
    }
    fn database() -> Database {
        Database::new(Some(folder()))
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
    /// The SQL for opening the database, writing a snapshot to `written` and
    /// checking it.
    fn saving(written: &Path) -> Vec<Step> {
        let mut steps = opening();
        steps.push(step(
            VACUUM,
            vec![text(&written.to_string_lossy())],
            Reply::Count(0),
        ));
        steps.extend(check_script(&written.to_string_lossy()));
        steps
    }
    /// `steps` up to and including the first step running `sql`, which fails.
    fn failing_at(steps: Vec<Step>, sql: &str) -> Vec<Step> {
        ending_at(steps, sql, Err(rusqlite::Error::InvalidQuery))
    }
    fn save(database: &Database) -> Result<Saved, Failure> {
        run(save_to(database, &target()))
    }
    #[test]
    fn a_history_that_could_not_be_upgraded_is_named_as_such() {
        filesystem::install(Files::default());
        let copy = Some("history-v2-20261021-143000.sqlite".to_owned());
        let database = Database::not_upgraded(folder(), copy.clone());
        assert_eq!(save(&database), Err(Failure::HistoryNotUpgraded(copy)));
        // Nothing is left beside the target.
        assert_eq!(removed_files(), [partial()]);
    }
    fn asked() -> Vec<Asked> {
        chooser::inspect(|state| state.asked.clone())
    }

    #[test]
    fn the_suggested_name_carries_the_local_day() {
        assert_eq!(suggested_name(when()), NAME);
    }

    #[test]
    fn a_checked_snapshot_is_flushed_beside_the_target_then_takes_its_name() {
        filesystem::install(Files::default());
        sql::expect(saving(&partial()));
        assert_eq!(save(&database()), Ok(Saved::Saved { name: NAME.into() }));
        sql::finish();
        filesystem::inspect(|state| assert_eq!(state.synced, [partial()]));
        assert_eq!(renamed(), [(partial(), target())]);
        assert!(removed_files().is_empty());
    }

    #[test]
    fn a_target_beside_which_nothing_can_be_claimed_fails() {
        filesystem::install(Files {
            directories: vec![partial()],
            ..Default::default()
        });
        assert_eq!(save(&database()), Err(Failure::BackupFailed));
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
    }

    #[test]
    fn each_failure_says_what_went_wrong_and_leaves_no_partial_file() {
        let failures = [
            // The history cannot be opened.
            (failing_at(opening(), "OPEN"), Failure::Storage),
            // The snapshot cannot be written there.
            (
                failing_at(saving(&partial()), VACUUM),
                Failure::BackupFailed,
            ),
            // The snapshot of the history fails its check.
            (
                failing_at(saving(&partial()), "PRAGMA integrity_check"),
                Failure::HistoryDamaged,
            ),
        ];
        for (steps, failure) in failures {
            filesystem::install(Files::default());
            sql::expect(steps);
            assert_eq!(save(&database()), Err(failure.clone()), "{failure:?}");
            sql::finish();
            assert_eq!(removed_files(), [partial()]);
            assert!(!has(&partial()));
            assert_eq!(renamed(), []);
        }
        // The checked snapshot cannot be flushed.
        filesystem::install(Files {
            sync_failure: true,
            ..Default::default()
        });
        sql::expect(saving(&partial()));
        assert_eq!(save(&database()), Err(Failure::BackupFailed));
        sql::finish();
        assert_eq!(removed_files(), [partial()]);
    }

    #[test]
    fn a_backup_is_never_saved_in_the_data_folder() {
        for target in [
            folder().join("history.sqlite"),
            folder().join("history.sqlite-journal"),
            folder().join("old").join(NAME),
        ] {
            // Whether or not the folders can be resolved, nothing is written.
            for directories in [vec![], vec![folder(), folder().join("old")]] {
                filesystem::install(Files {
                    directories,
                    ..Default::default()
                });
                assert_eq!(
                    run(save_to(&database(), &target)),
                    Err(Failure::BackupInDataFolder),
                    "{}",
                    target.display()
                );
                filesystem::inspect(|state| assert!(state.accessed.is_empty()));
            }
        }
        // A target without a file name is refused before anything is written.
        filesystem::install(Files::default());
        assert_eq!(
            run(save_to(&database(), Path::new("/"))),
            Err(Failure::BackupFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn saving_asks_where_then_saves_or_does_nothing_when_cancelled() {
        // Cancelling writes nothing.
        chooser::install(Answers::default());
        filesystem::install(Files::default());
        assert_eq!(
            run(save_into(app(), Dialogs::System, &database(), when())),
            Ok(Saved::Cancelled)
        );
        // The dialog suggests the day's name and offers backups.
        assert_eq!(
            asked(),
            [Asked {
                opening: false,
                file_name: NAME.into(),
                filter: "Astral Index backup".into(),
                extensions: vec!["sqlite".into()],
            }]
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // A fault in the dialog fails rather than passing for a cancellation.
        chooser::install(Answers {
            crash: true,
            ..Default::default()
        });
        assert_eq!(
            run(save_into(app(), Dialogs::System, &database(), when())),
            Err(Failure::BackupFailed)
        );
        // So does a choice that is not a local file, before anything is written.
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        filesystem::install(Files::default());
        assert_eq!(
            run(save_into(app(), Dialogs::System, &database(), when())),
            Err(Failure::BackupFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // Choosing a file saves the backup there.
        chooser::install(Answers {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        sql::expect(saving(&partial()));
        assert_eq!(
            run(save_into(app(), Dialogs::System, &database(), when())),
            Ok(Saved::Saved { name: NAME.into() })
        );
        sql::finish();
        assert_eq!(renamed(), [(partial(), target())]);
    }

    #[test]
    fn saved_and_cancelled_reach_the_webview_without_a_folder() {
        assert_eq!(
            serde_json::to_value(Saved::Saved { name: NAME.into() }).unwrap(),
            serde_json::json!({ "kind": "saved", "name": NAME })
        );
        assert_eq!(
            serde_json::to_value(Saved::Cancelled).unwrap(),
            serde_json::json!({ "kind": "cancelled" })
        );
    }
}
