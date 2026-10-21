//! The Backup & Restore screen's commands
//! ([decision 0031](../../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
//! Files are chosen in dialogs the Rust side opens, so no command takes a path from
//! the webview.
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
use super::{Failure, database::Database};
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::storage::check_database;
use chooser::DialogExt;
use serde::Serialize;
#[cfg(not(test))]
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime, State};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// The file in which the mock debug binary's tests name where a backup is saved;
/// without it, the save dialog counts as cancelled.
pub const ANSWER: &str = "save-as.txt";
/// How many temporary names beside a target are tried before giving up.
const PARTIAL_NAMES: usize = 8;

/// How the file dialogs are answered.
#[derive(Clone, Copy)]
pub enum Dialogs {
    /// By the user, in the system's dialogs.
    System,
    /// From answer files in the data folder, for the mock debug binary, which never
    /// opens a dialog
    /// ([decision 0014](../../../docs/architecture/decisions/0014-mock-debug-binary.md)).
    Answering,
}

/// The data folder, where the mock's answer is kept, and how files are chosen.
#[derive(Clone)]
pub struct Backup {
    pub folder: Option<PathBuf>,
    pub dialogs: Dialogs,
}

/// What became of a backup.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Saved {
    /// Saved under this file name; its folder is not sent back.
    Saved { name: String },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The suggested file name for a backup made on `date`, a `YYYY-MM-DD` the webview
/// sends, as only it knows the user's local date.
fn suggested_name(date: &str) -> Result<String, Failure> {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .ok()
        .filter(|parsed| parsed.format("%Y-%m-%d").to_string() == date)
        .map(|_| format!("Astral-Index-backup-{date}.sqlite"))
        .ok_or(Failure::InvalidRequest)
}

/// Where to save the backup: the user's choice in the save dialog, or the mock's
/// answer; none when the dialog is closed. A choice that is not a local file fails.
fn choose<R: Runtime>(
    app: &AppHandle<R>,
    backup: &Backup,
    name: &str,
) -> Result<Option<PathBuf>, Failure> {
    match backup.dialogs {
        Dialogs::System => app
            .dialog()
            .file()
            .set_file_name(name)
            .add_filter("Astral Index backup", &["sqlite"])
            .blocking_save_file()
            .map(|chosen| chosen.into_path().map_err(|_| Failure::BackupFailed))
            .transpose(),
        Dialogs::Answering => Ok(answer(backup.folder.as_deref(), ANSWER)),
    }
}

/// The mock's answer to a dialog: the path in the data folder's `file`, if any.
pub(super) fn answer(folder: Option<&Path>, file: &str) -> Option<PathBuf> {
    folder
        .and_then(|folder| fs::read_to_string(folder.join(file)).ok())
        .map(|answer| PathBuf::from(answer.trim_end()))
}

/// A file's or folder's real path where it can be found, so links and differing
/// forms of the same path compare equal.
pub(super) fn real(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_owned())
}

/// Whether `target` would sit inside the data folder, where a backup could replace
/// the live database or its journal.
pub(super) fn in_data_folder(folder: Option<&Path>, target: &Path) -> bool {
    folder
        .zip(target.parent())
        .is_some_and(|(folder, parent)| real(parent).starts_with(real(folder)))
}

/// The temporary names beside `target`, in the order they are tried:
/// `<target>.partial`, then `<target>.1.partial` and on.
fn partial_names(target: &Path) -> impl Iterator<Item = PathBuf> + '_ {
    (0..PARTIAL_NAMES).map(move |attempt| {
        let mut name = target.as_os_str().to_owned();
        if attempt > 0 {
            name.push(format!(".{attempt}"));
        }
        name.push(".partial");
        PathBuf::from(name)
    })
}

/// Claim an unused temporary file beside `target` by creating it empty, so a file
/// the user already has is never touched: `<target>.partial`, else `.1.partial`
/// and on. Returns the name claimed and the file, open for writing.
fn claim_partial(target: &Path) -> Result<(PathBuf, fs::File), Failure> {
    for partial in partial_names(target) {
        match fs::File::create_new(&partial) {
            Ok(file) => return Ok((partial, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => break,
        }
    }
    Err(Failure::BackupFailed)
}

/// Write a snapshot of the history to `written` and check it as restore would.
async fn write_checked(database: &Database, written: &Path) -> Result<(), Failure> {
    let snapshot = written.to_owned();
    database
        .run(move |store| {
            store
                .write_snapshot(&snapshot)
                .map_err(|_| Failure::BackupFailed)?;
            check_database(&snapshot).map_err(|_| Failure::HistoryDamaged)
        })
        .await
        .map_err(|_| Failure::Storage)?
}

/// Flush a written file to disk, then give it the target's name, replacing any file
/// there. Flushing needs the file open for writing, as Windows refuses otherwise.
pub(super) fn publish(written: &Path, target: &Path) -> std::io::Result<()> {
    fs::OpenOptions::new()
        .write(true)
        .open(written)
        .and_then(|file| file.sync_all())?;
    fs::rename(written, target)
}

/// Write a checked backup to `target`: a snapshot goes to a temporary file beside
/// it, is checked and flushed, then takes the target's name. Any failure removes
/// the temporary file, and only that file, so nothing is left half-written. A
/// target in the data folder is refused.
pub async fn save_to(
    database: &Database,
    folder: Option<&Path>,
    target: &Path,
) -> Result<Saved, Failure> {
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(Failure::BackupFailed)?;
    if in_data_folder(folder, target) {
        return Err(Failure::BackupInDataFolder);
    }
    let (written, _) = claim_partial(target)?;
    let saved = match write_checked(database, &written).await {
        Ok(()) => publish(&written, target).map_err(|_| Failure::BackupFailed),
        Err(failure) => Err(failure),
    };
    if saved.is_err() {
        let _ = fs::remove_file(&written);
    }
    saved.map(|()| Saved::Saved { name })
}

/// Ask where to save, off the async workers as the dialog blocks, then save a
/// checked backup there.
async fn save_into<R: Runtime>(
    app: AppHandle<R>,
    backup: &Backup,
    database: &Database,
    date: &str,
) -> Result<Saved, Failure> {
    let name = suggested_name(date)?;
    let asking = backup.clone();
    let chosen = spawn_blocking(move || choose(&app, &asking, &name))
        .await
        .map_err(|_| Failure::BackupFailed)??;
    match chosen {
        Some(target) => save_to(database, backup.folder.as_deref(), &target).await,
        None => Ok(Saved::Cancelled),
    }
}

/// Saves a backup where the user chooses; never contacts HoYoverse.
#[tauri::command]
pub async fn save_backup<R: Runtime>(
    app: AppHandle<R>,
    backup: State<'_, Backup>,
    database: State<'_, Database>,
    date: String,
) -> Result<Saved, Failure> {
    save_into(app, &backup, &database, &date).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};
    use crate::storage::tests::database::{self as sql, Reply, Step};
    use crate::storage::tests::{VACUUM, check_script, ending_at, setup, step, text};
    use chooser::{Asked, FilePath, Fixture as Answers};
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

    const NAME: &str = "Astral-Index-backup-2026-10-16.sqlite";

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
    /// The temporary name a save tries on its `attempt`, counting from 0, built
    /// from the target as the platform joins it.
    fn partial(attempt: usize) -> PathBuf {
        let mut name = target().into_os_string();
        if attempt > 0 {
            name.push(format!(".{attempt}"));
        }
        name.push(".partial");
        PathBuf::from(name)
    }
    fn system() -> Backup {
        Backup {
            folder: Some(folder()),
            dialogs: Dialogs::System,
        }
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
    fn files(entries: &[(PathBuf, &[u8])]) -> Files {
        Files {
            files: entries
                .iter()
                .map(|(path, bytes)| (path.clone(), bytes.to_vec()))
                .collect(),
            ..Default::default()
        }
    }
    fn save(database: &Database) -> Result<Saved, Failure> {
        run(save_to(database, Some(&folder()), &target()))
    }
    fn removed_files() -> Vec<PathBuf> {
        filesystem::inspect(|state| state.removed_files.clone())
    }
    fn renamed() -> Vec<(PathBuf, PathBuf)> {
        filesystem::inspect(|state| state.renamed.clone())
    }
    fn has(path: &Path) -> bool {
        filesystem::inspect(|state| state.files.contains_key(path))
    }
    fn asked() -> Vec<Asked> {
        chooser::inspect(|state| state.asked.clone())
    }

    #[test]
    fn the_suggested_name_carries_a_real_calendar_date_only() {
        assert_eq!(suggested_name("2026-10-16"), Ok(NAME.to_owned()));
        for date in [
            "2026-13-01",
            "2026-02-30",
            "2026-1-05",
            "16/10/2026",
            "2026-10-16/../x",
            "",
        ] {
            assert_eq!(suggested_name(date), Err(Failure::InvalidRequest), "{date}");
        }
    }

    #[test]
    fn the_save_dialog_suggests_the_name_and_returns_the_chosen_file() {
        chooser::install(Answers {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        assert_eq!(choose(&app(), &system(), NAME), Ok(Some(target())));
        assert_eq!(
            asked(),
            [Asked {
                opening: false,
                file_name: NAME.into(),
                filter: "Astral Index backup".into(),
                extensions: vec!["sqlite".into()],
            }]
        );
        // Closing the dialog chooses nothing; a choice that is not a local file fails.
        chooser::install(Answers::default());
        assert_eq!(choose(&app(), &system(), NAME), Ok(None));
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(choose(&app(), &system(), NAME), Err(Failure::BackupFailed));
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let answering = |folder: Option<PathBuf>| Backup {
            folder,
            dialogs: Dialogs::Answering,
        };
        let answer = format!("{}\n", target().display());
        filesystem::install(files(&[(folder().join(ANSWER), answer.as_bytes())]));
        chooser::install(Answers::default());
        assert_eq!(
            choose(&app(), &answering(Some(folder())), NAME),
            Ok(Some(target()))
        );
        // It never opens the real dialog.
        assert_eq!(asked(), []);
        filesystem::install(Files::default());
        assert_eq!(choose(&app(), &answering(Some(folder())), NAME), Ok(None));
        assert_eq!(choose(&app(), &answering(None), NAME), Ok(None));
    }

    #[test]
    fn a_checked_snapshot_is_flushed_beside_the_target_then_takes_its_name() {
        filesystem::install(Files::default());
        sql::expect(saving(&partial(0)));
        assert_eq!(save(&database()), Ok(Saved::Saved { name: NAME.into() }));
        sql::finish();
        filesystem::inspect(|state| assert_eq!(state.synced, [partial(0)]));
        assert_eq!(renamed(), [(partial(0), target())]);
        assert!(removed_files().is_empty());
    }

    #[test]
    fn a_file_the_user_already_has_beside_the_target_is_never_touched() {
        // Their own file takes the first name, so the next free one is used.
        filesystem::install(files(&[(partial(0), b"the user's own file")]));
        sql::expect(saving(&partial(1)));
        assert_eq!(save(&database()), Ok(Saved::Saved { name: NAME.into() }));
        sql::finish();
        assert!(has(&partial(0)));
        assert_eq!(renamed(), [(partial(1), target())]);
        // When every name is taken, nothing is written and nothing removed.
        let taken: Vec<(PathBuf, &[u8])> = (0..PARTIAL_NAMES)
            .map(|attempt| (partial(attempt), b"taken".as_slice()))
            .collect();
        filesystem::install(files(&taken));
        assert_eq!(save(&database()), Err(Failure::BackupFailed));
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
        // A place that cannot be written fails at once.
        filesystem::install(Files {
            directories: vec![partial(0)],
            ..Default::default()
        });
        assert_eq!(save(&database()), Err(Failure::BackupFailed));
        assert!(removed_files().is_empty());
    }

    #[test]
    fn each_failure_says_what_went_wrong_and_leaves_no_partial_file() {
        let failures = [
            // The history cannot be opened.
            (failing_at(opening(), "OPEN"), Failure::Storage),
            // The snapshot cannot be written there.
            (
                failing_at(saving(&partial(0)), VACUUM),
                Failure::BackupFailed,
            ),
            // The snapshot of the history fails its check.
            (
                failing_at(saving(&partial(0)), "PRAGMA integrity_check"),
                Failure::HistoryDamaged,
            ),
        ];
        for (steps, failure) in failures {
            filesystem::install(Files::default());
            sql::expect(steps);
            assert_eq!(save(&database()), Err(failure.clone()), "{failure:?}");
            sql::finish();
            assert_eq!(removed_files(), [partial(0)]);
            assert!(!has(&partial(0)));
            assert_eq!(renamed(), []);
        }
        // Flushing fails, or the rename does.
        for files in [
            Files {
                sync_failure: true,
                ..Default::default()
            },
            Files {
                directories: vec![target()],
                ..Default::default()
            },
        ] {
            filesystem::install(files);
            sql::expect(saving(&partial(0)));
            assert_eq!(save(&database()), Err(Failure::BackupFailed));
            sql::finish();
            assert_eq!(removed_files(), [partial(0)]);
        }
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
                    run(save_to(&database(), Some(&folder()), &target)),
                    Err(Failure::BackupInDataFolder),
                    "{}",
                    target.display()
                );
                filesystem::inspect(|state| assert!(state.accessed.is_empty()));
            }
        }
        // Beside it, or anywhere when there is no data folder, is fine.
        let beside = PathBuf::from("/data/astral-index-backups").join(NAME);
        assert!(!in_data_folder(Some(&folder()), &beside));
        assert!(!in_data_folder(None, &target()));
        // A target without a file name is refused before anything is written.
        filesystem::install(Files::default());
        assert_eq!(
            run(save_to(&database(), Some(&folder()), Path::new("/"))),
            Err(Failure::BackupFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn saving_asks_where_then_saves_or_does_nothing_when_cancelled() {
        // A malformed date is refused before any dialog.
        chooser::install(Answers::default());
        assert_eq!(
            run(save_into(app(), &system(), &database(), "16/10/2026")),
            Err(Failure::InvalidRequest)
        );
        assert_eq!(asked(), []);
        // Cancelling writes nothing.
        filesystem::install(Files::default());
        assert_eq!(
            run(save_into(app(), &system(), &database(), "2026-10-16")),
            Ok(Saved::Cancelled)
        );
        assert_eq!(asked().len(), 1);
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // A fault in the dialog fails rather than passing for a cancellation.
        chooser::install(Answers {
            crash: true,
            ..Default::default()
        });
        assert_eq!(
            run(save_into(app(), &system(), &database(), "2026-10-16")),
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
            run(save_into(app(), &system(), &database(), "2026-10-16")),
            Err(Failure::BackupFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // Choosing a file saves the backup there.
        chooser::install(Answers {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        sql::expect(saving(&partial(0)));
        assert_eq!(
            run(save_into(app(), &system(), &database(), "2026-10-16")),
            Ok(Saved::Saved { name: NAME.into() })
        );
        sql::finish();
        assert_eq!(renamed(), [(partial(0), target())]);
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
