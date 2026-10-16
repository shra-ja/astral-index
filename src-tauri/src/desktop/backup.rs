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

/// How the save dialog is answered.
#[derive(Clone, Copy)]
pub enum Saver {
    /// By the user, in the system's save dialog.
    System,
    /// From `save-as.txt` in the data folder, for the mock debug binary, which never
    /// opens a dialog
    /// ([decision 0014](../../../docs/architecture/decisions/0014-mock-debug-binary.md)).
    Answering,
}

/// The data folder, where the mock's answer is kept, and how files are chosen.
pub struct Backup {
    pub folder: Option<PathBuf>,
    pub saver: Saver,
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
/// answer. Closing the dialog, or choosing something that is not a local file,
/// chooses nothing.
fn choose<R: Runtime>(app: &AppHandle<R>, backup: &Backup, name: &str) -> Option<PathBuf> {
    match backup.saver {
        Saver::System => app
            .dialog()
            .file()
            .set_file_name(name)
            .add_filter("Astral Index backup", &["sqlite"])
            .blocking_save_file()
            .and_then(|chosen| chosen.into_path().ok()),
        Saver::Answering => backup
            .folder
            .as_ref()
            .and_then(|folder| fs::read_to_string(folder.join(ANSWER)).ok())
            .map(|answer| PathBuf::from(answer.trim_end())),
    }
}

/// The temporary file beside `target` that a snapshot is written to first.
fn partial(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_owned();
    name.push(".partial");
    PathBuf::from(name)
}

/// Write a checked backup to `target`: a snapshot goes to a temporary file beside
/// it, is checked as restore would check it, then takes the target's name. Any
/// failure removes the temporary file, so nothing is left half-written.
async fn save_to(database: &Database, target: &Path) -> Result<Saved, Failure> {
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(Failure::BackupFailed)?;
    let written = partial(target);
    // A file left by an interrupted attempt would stop the snapshot.
    let _ = fs::remove_file(&written);
    let snapshot = written.clone();
    let checked = database
        .run(move |store| {
            store
                .write_snapshot(&snapshot)
                .and_then(|()| check_database(&snapshot))
        })
        .await;
    if matches!(checked, Ok(Ok(()))) && fs::rename(&written, target).is_ok() {
        Ok(Saved::Saved { name })
    } else {
        let _ = fs::remove_file(&written);
        Err(Failure::BackupFailed)
    }
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
    let asking = Backup {
        folder: backup.folder.clone(),
        saver: backup.saver,
    };
    let chosen = spawn_blocking(move || choose(&app, &asking, &name))
        .await
        .ok()
        .flatten();
    match chosen {
        Some(target) => save_to(database, &target).await,
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
    use crate::storage::tests::{check_script, setup, step, text};
    use chooser::{Asked, FilePath, Fixture as Dialogs};
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
    fn target() -> PathBuf {
        PathBuf::from("/backups").join(NAME)
    }
    fn partial() -> PathBuf {
        PathBuf::from(format!("/backups/{NAME}.partial"))
    }
    fn system() -> Backup {
        Backup {
            folder: Some(folder()),
            saver: Saver::System,
        }
    }
    fn database() -> Database {
        Database::new(Some(folder()))
    }
    /// The SQL for opening the database, writing a snapshot to the partial file and
    /// checking it.
    fn saving() -> Vec<Step> {
        let mut steps = vec![step(
            "OPEN",
            vec![text(&folder().join("history.sqlite").to_string_lossy())],
            Reply::Done,
        )];
        steps.extend(setup(true));
        steps.push(step(
            "VACUUM INTO ?1",
            vec![text(&partial().to_string_lossy())],
            Reply::Count(0),
        ));
        steps.extend(check_script(&partial().to_string_lossy()));
        steps
    }
    fn removed_files() -> Vec<PathBuf> {
        filesystem::inspect(|state| state.removed_files.clone())
    }
    fn renamed() -> Vec<(PathBuf, PathBuf)> {
        filesystem::inspect(|state| state.renamed.clone())
    }
    fn asked() -> Vec<Asked> {
        chooser::inspect(|state| state.asked.iter().map(clone_asked).collect())
    }
    fn clone_asked(asked: &Asked) -> Asked {
        Asked {
            file_name: asked.file_name.clone(),
            filter: asked.filter.clone(),
            extensions: asked.extensions.clone(),
        }
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
        chooser::install(Dialogs {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        assert_eq!(choose(&app(), &system(), NAME), Some(target()));
        assert_eq!(
            asked(),
            [Asked {
                file_name: NAME.into(),
                filter: "Astral Index backup".into(),
                extensions: vec!["sqlite".into()],
            }]
        );
        // Closing the dialog, or a choice that is not a local file, saves nothing.
        chooser::install(Dialogs::default());
        assert_eq!(choose(&app(), &system(), NAME), None);
        chooser::install(Dialogs {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(choose(&app(), &system(), NAME), None);
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let answering = |folder: Option<PathBuf>| Backup {
            folder,
            saver: Saver::Answering,
        };
        filesystem::install(Files {
            files: [(
                folder().join(ANSWER),
                format!("{}\n", target().display()).into_bytes(),
            )]
            .into(),
            ..Default::default()
        });
        chooser::install(Dialogs::default());
        assert_eq!(
            choose(&app(), &answering(Some(folder())), NAME),
            Some(target())
        );
        // It never opens the real dialog.
        assert_eq!(asked(), []);
        filesystem::install(Files::default());
        assert_eq!(choose(&app(), &answering(Some(folder())), NAME), None);
        assert_eq!(choose(&app(), &answering(None), NAME), None);
    }

    #[test]
    fn a_checked_snapshot_is_written_beside_the_target_then_takes_its_name() {
        // A partial file left by an interrupted attempt would stop the snapshot.
        filesystem::install(Files {
            files: [(partial(), b"interrupted".to_vec())].into(),
            ..Default::default()
        });
        sql::expect(saving());
        assert_eq!(
            run(save_to(&database(), &target())),
            Ok(Saved::Saved { name: NAME.into() })
        );
        sql::finish();
        // It is cleared first, and the checked snapshot takes the target's name.
        assert_eq!(removed_files(), [partial()]);
        assert_eq!(renamed(), [(partial(), target())]);
        filesystem::inspect(|state| assert!(!state.files.contains_key(&partial())));
    }

    #[test]
    fn a_failed_snapshot_check_or_rename_leaves_no_partial_file() {
        // The snapshot fails, or its check fails.
        for failing_step in [7, 12] {
            filesystem::install(Files::default());
            let mut steps = saving();
            steps.truncate(failing_step + 1);
            steps[failing_step].reply = Err(rusqlite::Error::InvalidQuery);
            sql::expect(steps);
            assert_eq!(
                run(save_to(&database(), &target())),
                Err(Failure::BackupFailed),
                "step {failing_step}"
            );
            sql::finish();
            assert_eq!(removed_files(), [partial(), partial()]);
            assert_eq!(renamed(), []);
        }
        // The rename fails.
        filesystem::install(Files {
            directories: vec![target()],
            ..Default::default()
        });
        sql::expect(saving());
        assert_eq!(
            run(save_to(&database(), &target())),
            Err(Failure::BackupFailed)
        );
        sql::finish();
        assert_eq!(removed_files(), [partial(), partial()]);
        // A target without a file name is refused before anything is written.
        filesystem::install(Files::default());
        assert_eq!(
            run(save_to(&database(), Path::new("/"))),
            Err(Failure::BackupFailed)
        );
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
    }

    #[test]
    fn saving_asks_where_then_saves_or_does_nothing_when_cancelled() {
        // A malformed date is refused before any dialog.
        chooser::install(Dialogs::default());
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
        assert_eq!((removed_files(), renamed()), (vec![], vec![]));
        // Choosing a file saves the backup there.
        chooser::install(Dialogs {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        sql::expect(saving());
        assert_eq!(
            run(save_into(app(), &system(), &database(), "2026-10-16")),
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
