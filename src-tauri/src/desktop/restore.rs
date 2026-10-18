//! The Backup & Restore screen's restore commands
//! ([decision 0031](../../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
//! A backup is untrusted input: it is chosen in a dialog the Rust side opens, copied
//! into the data folder and checked there, and held for the confirmation. Nothing
//! of the history changes until the restore is confirmed.
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
use super::{
    Failure,
    backup::{Backup, Dialogs, answer, claim_partial, in_data_folder, partial_names},
    database::Database,
};
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::storage::{Contents, MAX_DATABASE_BYTES, Refusal, Store, check_database};
use chooser::DialogExt;
use serde::Serialize;
#[cfg(not(test))]
use std::fs;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};
use tauri::{AppHandle, Runtime, State};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// The file in which the mock debug binary's tests name the backup to restore;
/// without it, the open dialog counts as cancelled.
pub const ANSWER: &str = "restore-from.txt";
/// The held copy's name in the data folder, before its claimed temporary suffix.
const HELD: &str = "restore.sqlite";

/// The checked copy of the backup being restored, in the data folder, until it is
/// restored, cancelled or another backup is chosen.
#[derive(Default)]
pub struct Restore {
    held: Mutex<Option<PathBuf>>,
}
impl Restore {
    /// Hold `copy` in place of any earlier copy, which is removed.
    fn hold(&self, copy: Option<PathBuf>) {
        let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(earlier) = std::mem::replace(&mut *held, copy) {
            let _ = fs::remove_file(earlier);
        }
    }
}

/// Remove copies an earlier run held when the app closed or crashed, so they neither
/// take space nor use up the temporary names. Only the names a held copy can take are
/// removed; nothing else in the data folder is looked at.
pub fn remove_leftovers(folder: Option<&Path>) {
    if let Some(folder) = folder {
        for leftover in partial_names(&folder.join(HELD)) {
            let _ = fs::remove_file(leftover);
        }
    }
}

/// What became of choosing a backup to restore.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Chosen {
    /// Checked and held: the backup's file name, what it holds and what the current
    /// history holds, for the confirmation. Its folder is not sent.
    Checked {
        name: String,
        backup: Contents,
        current: Contents,
    },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The backup to restore: the user's choice in the open dialog, or the mock's
/// answer; none when the dialog is closed. A choice that is not a local file fails.
fn choose<R: Runtime>(app: &AppHandle<R>, backup: &Backup) -> Result<Option<PathBuf>, Failure> {
    match backup.dialogs {
        Dialogs::System => app
            .dialog()
            .file()
            .add_filter("Astral Index backup", &["sqlite"])
            .blocking_pick_file()
            .map(|chosen| chosen.into_path().map_err(|_| Failure::RestoreFailed))
            .transpose(),
        Dialogs::Answering => Ok(answer(backup.folder.as_deref(), ANSWER)),
    }
}

/// Copy at most `limit` bytes of `source` into `to`, refusing a larger file, even
/// one that grows while it is copied.
fn copy_bounded(source: &Path, to: &mut dyn Write, limit: u64) -> Result<(), Failure> {
    let refused = Failure::RestoreRefused;
    let from = fs::File::open(source).map_err(|_| refused(Refusal::Unreadable))?;
    let size = from.metadata().map_err(|_| refused(Refusal::Unreadable))?;
    if size.len() > limit {
        return Err(refused(Refusal::TooLarge));
    }
    let mut from = from.take(limit + 1);
    let mut buffer = vec![0; 64 * 1024];
    let mut copied = 0;
    loop {
        let read = from
            .read(&mut buffer)
            .map_err(|_| refused(Refusal::Unreadable))?;
        if read == 0 {
            return Ok(());
        }
        copied += read as u64;
        if copied > limit {
            return Err(refused(Refusal::TooLarge));
        }
        to.write_all(&buffer[..read])
            .map_err(|_| Failure::RestoreFailed)?;
    }
}

/// Copy `source` into the data folder under a claimed temporary name, check the
/// copy as untrusted input, open it, which brings it to the current schema, and read
/// what it holds. Any failure removes the copy.
pub fn hold_copy(folder: &Path, source: &Path) -> Result<(PathBuf, Contents), Failure> {
    let (copy, mut file) = claim_partial(&folder.join(HELD)).map_err(|_| Failure::RestoreFailed)?;
    let checked = copy_bounded(source, &mut file, MAX_DATABASE_BYTES)
        .and_then(|()| {
            drop(file);
            check_database(&copy).map_err(Failure::RestoreRefused)
        })
        .and_then(|()| {
            Store::open(&copy)
                .and_then(|store| store.contents())
                .map_err(|_| Failure::RestoreFailed)
        });
    match checked {
        Ok(contents) => Ok((copy, contents)),
        Err(failure) => {
            let _ = fs::remove_file(&copy);
            Err(failure)
        }
    }
}

/// Ask which backup to restore, off the async workers as the dialog blocks, then
/// copy, check and hold it, and read the current history to compare.
async fn choose_into<R: Runtime>(
    app: AppHandle<R>,
    backup: &Backup,
    restore: &Restore,
    database: &Database,
) -> Result<Chosen, Failure> {
    // Without a data folder there is nowhere to check a copy, so nothing is asked.
    let folder = backup.folder.clone().ok_or(Failure::RestoreFailed)?;
    let asking = backup.clone();
    let chosen = spawn_blocking(move || choose(&app, &asking))
        .await
        .map_err(|_| Failure::RestoreFailed)??;
    let Some(source) = chosen else {
        return Ok(Chosen::Cancelled);
    };
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(Failure::RestoreFailed)?;
    if in_data_folder(Some(&folder), &source) {
        return Err(Failure::RestoreInDataFolder);
    }
    // Another backup was chosen, so the one held earlier is no longer shown.
    restore.hold(None);
    let (copy, contents) = spawn_blocking(move || hold_copy(&folder, &source))
        .await
        .map_err(|_| Failure::RestoreFailed)??;
    match database.run(|store| store.contents()).await {
        Ok(Ok(current)) => {
            restore.hold(Some(copy));
            Ok(Chosen::Checked {
                name,
                backup: contents,
                current,
            })
        }
        _ => {
            let _ = fs::remove_file(&copy);
            Err(Failure::Storage)
        }
    }
}

/// Chooses a backup to restore and checks it, changing nothing of the history;
/// never contacts HoYoverse.
#[tauri::command]
pub async fn choose_restore<R: Runtime>(
    app: AppHandle<R>,
    backup: State<'_, Backup>,
    restore: State<'_, Restore>,
    database: State<'_, Database>,
) -> Result<Chosen, Failure> {
    choose_into(app, &backup, &restore, &database).await
}

/// Drops the held copy of the backup, if any; the history is unchanged.
#[tauri::command]
pub fn cancel_restore(restore: State<'_, Restore>) {
    restore.hold(None);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};
    use crate::desktop::backup::PARTIAL_NAMES;
    use crate::storage::tests::database::{self as sql, Reply, Step};
    use crate::storage::tests::{
        SERVER, UID, accounts_row, accounts_script, check_script, ending_at, last_import_row,
        last_import_step, setup, step, text,
    };
    use crate::storage::{LastImport, SavedAccount, Source};
    use chooser::{Asked, FilePath, Fixture as Answers};
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

    const BYTES: &[u8] = b"synthetic backup bytes";

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
    fn source() -> PathBuf {
        PathBuf::from("/backups/Astral-Index-backup-2026-10-16.sqlite")
    }
    /// The temporary name the held copy takes on its `attempt`, counting from 0,
    /// built as the platform joins it.
    fn held(attempt: usize) -> PathBuf {
        let mut name = folder().join(HELD).into_os_string();
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
    /// The SQL for opening the database at `path` and reading what it holds.
    fn reading(path: &Path, accounts: Vec<Vec<rusqlite::types::Value>>) -> Vec<Step> {
        let mut steps = vec![step(
            "OPEN",
            vec![text(&path.to_string_lossy())],
            Reply::Done,
        )];
        steps.extend(setup(true));
        steps.extend(accounts_script(accounts));
        steps.push(last_import_step(vec![last_import_row()]));
        steps
    }
    /// The SQL for checking and reading the held copy, then reading the history.
    fn choosing(copy: &Path) -> Vec<Step> {
        let mut steps = check_script(&copy.to_string_lossy());
        steps.extend(reading(copy, vec![accounts_row()]));
        steps.extend(reading(&folder().join("history.sqlite"), vec![]));
        steps
    }
    /// The fixture account with 15 rolls and its last import, as the scripts read it.
    fn contents(accounts: usize) -> Contents {
        Contents {
            accounts: (0..accounts)
                .map(|_| SavedAccount {
                    uid: UID.into(),
                    server: SERVER.into(),
                    timezone: Some(8),
                    rolls: 15,
                })
                .collect(),
            last_import: Some(LastImport {
                imported_at: 1_790_000_000,
                source: Source::Hoyoverse,
                uid: UID.into(),
                server: SERVER.into(),
                inserted: 96,
            }),
        }
    }
    fn checked() -> Chosen {
        Chosen::Checked {
            name: "Astral-Index-backup-2026-10-16.sqlite".into(),
            backup: contents(1),
            current: contents(0),
        }
    }
    /// A file system holding the backup and the files given.
    fn files(extra: &[(PathBuf, &[u8])]) -> Files {
        let mut files = vec![(source(), BYTES.to_vec())];
        files.extend(
            extra
                .iter()
                .map(|(path, bytes)| (path.clone(), bytes.to_vec())),
        );
        Files {
            files: files.into_iter().collect(),
            ..Default::default()
        }
    }
    fn answering(answer: Option<PathBuf>) {
        chooser::install(Answers {
            answer: answer.map(FilePath::Path),
            ..Default::default()
        });
    }
    fn choose_now(restore: &Restore) -> Result<Chosen, Failure> {
        run(choose_into(app(), &system(), restore, &database()))
    }
    fn has(path: &Path) -> bool {
        filesystem::inspect(|state| state.files.contains_key(path))
    }
    fn holding(restore: &Restore) -> Option<PathBuf> {
        restore.held.lock().unwrap().clone()
    }

    #[test]
    fn the_open_dialog_offers_backups_and_returns_the_chosen_file() {
        answering(Some(source()));
        assert_eq!(choose(&app(), &system()), Ok(Some(source())));
        assert_eq!(
            chooser::inspect(|state| state.asked.clone()),
            [Asked {
                opening: true,
                file_name: String::new(),
                filter: "Astral Index backup".into(),
                extensions: vec!["sqlite".into()],
            }]
        );
        // Closing the dialog chooses nothing; a choice that is not a local file fails.
        answering(None);
        assert_eq!(choose(&app(), &system()), Ok(None));
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(choose(&app(), &system()), Err(Failure::RestoreFailed));
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let mock = |folder: Option<PathBuf>| Backup {
            folder,
            dialogs: Dialogs::Answering,
        };
        let answer = format!("{}\n", source().display());
        filesystem::install(files(&[(folder().join(ANSWER), answer.as_bytes())]));
        answering(None);
        assert_eq!(choose(&app(), &mock(Some(folder()))), Ok(Some(source())));
        // It never opens the real dialog.
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        filesystem::install(Files::default());
        assert_eq!(choose(&app(), &mock(Some(folder()))), Ok(None));
        assert_eq!(choose(&app(), &mock(None)), Ok(None));
    }

    #[test]
    fn a_chosen_backup_is_copied_into_the_data_folder_checked_and_held() {
        filesystem::install(files(&[]));
        answering(Some(source()));
        sql::expect(choosing(&held(0)));
        let restore = Restore::default();
        assert_eq!(choose_now(&restore), Ok(checked()));
        sql::finish();
        // The copy holds the backup's bytes; the backup itself is untouched.
        filesystem::inspect(|state| {
            assert_eq!(state.files[&held(0)], BYTES);
            assert_eq!(state.files[&source()], BYTES);
            assert!(state.removed_files.is_empty());
            assert!(state.renamed.is_empty());
        });
        assert_eq!(holding(&restore), Some(held(0)));
    }

    #[test]
    fn a_file_already_in_the_data_folder_is_never_touched() {
        filesystem::install(files(&[(held(0), b"another file")]));
        answering(Some(source()));
        sql::expect(choosing(&held(1)));
        assert_eq!(choose_now(&Restore::default()), Ok(checked()));
        sql::finish();
        filesystem::inspect(|state| assert_eq!(state.files[&held(0)], b"another file"));
    }

    #[test]
    fn cancelling_the_dialog_changes_nothing() {
        filesystem::install(files(&[]));
        answering(None);
        let restore = Restore::default();
        *restore.held.lock().unwrap() = Some(held(0));
        assert_eq!(choose_now(&restore), Ok(Chosen::Cancelled));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // A copy held earlier is kept for its confirmation.
        assert_eq!(holding(&restore), Some(held(0)));
        // A fault in the dialog fails rather than passing for a cancellation.
        chooser::install(Answers {
            crash: true,
            ..Default::default()
        });
        assert_eq!(choose_now(&restore), Err(Failure::RestoreFailed));
        // So does a choice that is not a local file, before anything is read.
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(choose_now(&restore), Err(Failure::RestoreFailed));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(holding(&restore), Some(held(0)));
    }

    #[test]
    fn a_backup_in_the_data_folder_is_refused_before_it_is_read() {
        for chosen in [
            folder().join("history.sqlite"),
            folder().join("history-before-restore-20261016-120000.sqlite"),
        ] {
            filesystem::install(Files::default());
            answering(Some(chosen));
            assert_eq!(
                choose_now(&Restore::default()),
                Err(Failure::RestoreInDataFolder)
            );
            filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        }
        // Without a data folder there is nowhere to check a copy, so no dialog opens.
        filesystem::install(files(&[]));
        answering(Some(source()));
        let nowhere = Backup {
            folder: None,
            dialogs: Dialogs::System,
        };
        assert_eq!(
            run(choose_into(
                app(),
                &nowhere,
                &Restore::default(),
                &Database::new(None)
            )),
            Err(Failure::RestoreFailed)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        // A choice without a file name is refused before anything is read.
        filesystem::install(files(&[]));
        answering(Some(PathBuf::from("/")));
        assert_eq!(choose_now(&Restore::default()), Err(Failure::RestoreFailed));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn each_refusal_or_failure_says_why_and_leaves_no_copy() {
        let refused = |refusal| Failure::RestoreRefused(refusal);
        let mut too_large = files(&[]);
        too_large.lengths = [(source(), MAX_DATABASE_BYTES + 1)].into();
        let unwritable = Files {
            write_failure: true,
            ..files(&[])
        };
        let cases = [
            // Too large to copy, judged before reading it.
            (too_large, vec![], refused(Refusal::TooLarge)),
            // Gone before it could be read.
            (Files::default(), vec![], refused(Refusal::Unreadable)),
            // The copy cannot be written.
            (unwritable, vec![], Failure::RestoreFailed),
            // The copy fails its check.
            (
                files(&[]),
                ending_at(
                    check_script(&held(0).to_string_lossy()),
                    "PRAGMA application_id",
                    Ok(Reply::Rows(vec![Ok(vec![
                        rusqlite::types::Value::Integer(0),
                    ])])),
                ),
                refused(Refusal::OtherApp),
            ),
            // The checked copy cannot be opened or read.
            (
                files(&[]),
                ending_at(
                    choosing(&held(0)),
                    "OPEN",
                    Err(rusqlite::Error::InvalidQuery),
                ),
                Failure::RestoreFailed,
            ),
            // The current history cannot be read.
            (
                files(&[]),
                {
                    let mut steps = choosing(&held(0));
                    let last = steps.iter().rposition(|step| step.sql == "OPEN").unwrap();
                    steps.truncate(last + 1);
                    steps[last].reply = Err(rusqlite::Error::InvalidQuery);
                    steps
                },
                Failure::Storage,
            ),
        ];
        for (fixture, steps, failure) in cases {
            filesystem::install(fixture);
            answering(Some(source()));
            sql::expect(steps);
            let restore = Restore::default();
            assert_eq!(choose_now(&restore), Err(failure.clone()), "{failure:?}");
            sql::finish();
            assert!(!has(&held(0)), "{failure:?}");
            assert_eq!(holding(&restore), None);
        }
        // When no temporary name can be claimed, nothing is written or removed.
        let taken: Vec<(PathBuf, &[u8])> = (0..PARTIAL_NAMES)
            .map(|attempt| (held(attempt), b"x".as_slice()))
            .collect();
        filesystem::install(files(&taken));
        answering(Some(source()));
        assert_eq!(choose_now(&Restore::default()), Err(Failure::RestoreFailed));
        filesystem::inspect(|state| assert!(state.removed_files.is_empty()));
    }

    #[test]
    fn copies_left_by_an_earlier_run_are_removed_and_nothing_else() {
        let history = folder().join("history.sqlite");
        let beyond = folder().join(format!("{HELD}.{PARTIAL_NAMES}.partial"));
        filesystem::install(files(&[
            (held(0), b"left by a quit"),
            (held(PARTIAL_NAMES - 1), b"left by a crash"),
            (history.clone(), b"the history"),
            (beyond.clone(), b"not a name a copy takes"),
        ]));
        remove_leftovers(Some(&folder()));
        filesystem::inspect(|state| {
            let names: Vec<PathBuf> = (0..PARTIAL_NAMES).map(held).collect();
            assert_eq!(state.removed_files, names);
            let mut kept = vec![source(), history.clone(), beyond.clone()];
            kept.sort();
            assert_eq!(state.files.keys().cloned().collect::<Vec<_>>(), kept);
        });
        // Without a data folder there is nothing to remove.
        filesystem::install(Files::default());
        remove_leftovers(None);
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn a_file_that_grows_past_the_bound_while_copied_is_refused() {
        filesystem::install(files(&[]));
        let mut copy = Vec::new();
        assert_eq!(
            copy_bounded(&source(), &mut copy, BYTES.len() as u64),
            Ok(())
        );
        assert_eq!(copy, BYTES);
        // Its size said it fitted, but reading finds more.
        let mut growing = files(&[]);
        growing.lengths = [(source(), 1)].into();
        filesystem::install(growing);
        assert_eq!(
            copy_bounded(&source(), &mut Vec::new(), BYTES.len() as u64 - 1),
            Err(Failure::RestoreRefused(Refusal::TooLarge))
        );
    }

    #[test]
    fn a_backup_that_cannot_be_measured_or_read_is_unreadable() {
        let unreadable = Err(Failure::RestoreRefused(Refusal::Unreadable));
        for fixture in [
            Files {
                metadata_failure: true,
                ..files(&[])
            },
            Files {
                read_failure: true,
                ..files(&[])
            },
        ] {
            filesystem::install(fixture);
            assert_eq!(copy_bounded(&source(), &mut Vec::new(), 1024), unreadable);
        }
    }

    #[test]
    fn a_fault_while_checking_fails_rather_than_passing() {
        // The SQL double panics at a call it does not expect, as a fault would.
        filesystem::install(files(&[]));
        answering(Some(source()));
        sql::expect(vec![]);
        let restore = Restore::default();
        assert_eq!(choose_now(&restore), Err(Failure::RestoreFailed));
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn choosing_another_backup_or_cancelling_drops_the_held_copy() {
        filesystem::install(files(&[(held(0), b"the earlier copy")]));
        let restore = Restore::default();
        *restore.held.lock().unwrap() = Some(held(0));
        answering(Some(source()));
        // The earlier copy is removed first, so its name is free for the new one.
        sql::expect(choosing(&held(0)));
        assert_eq!(choose_now(&restore), Ok(checked()));
        sql::finish();
        filesystem::inspect(|state| {
            assert_eq!(state.removed_files, [held(0)]);
            assert_eq!(state.files[&held(0)], BYTES);
        });
        assert_eq!(holding(&restore), Some(held(0)));
        // A refused choice drops it too, as the confirmation no longer shows it.
        let mut too_large = files(&[(held(0), BYTES)]);
        too_large.lengths = [(source(), MAX_DATABASE_BYTES + 1)].into();
        filesystem::install(too_large);
        answering(Some(source()));
        assert_eq!(
            choose_now(&restore),
            Err(Failure::RestoreRefused(Refusal::TooLarge))
        );
        assert!(!has(&held(0)));
        assert_eq!(holding(&restore), None);
        // Cancelling the restore removes the held copy; with none, it does nothing.
        filesystem::install(files(&[(held(0), BYTES)]));
        *restore.held.lock().unwrap() = Some(held(0));
        restore.hold(None);
        assert!(!has(&held(0)));
        restore.hold(None);
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn the_webview_gets_both_summaries_and_never_a_path() {
        assert_eq!(
            serde_json::to_value(checked()).unwrap(),
            serde_json::json!({
                "kind": "checked",
                "name": "Astral-Index-backup-2026-10-16.sqlite",
                "backup": {
                    "accounts": [{ "uid": UID, "server": SERVER, "timezone": 8, "rolls": 15 }],
                    "last_import": {
                        "imported_at": 1_790_000_000,
                        "source": "hoyoverse",
                        "uid": UID,
                        "server": SERVER,
                        "inserted": 96,
                    },
                },
                "current": {
                    "accounts": [],
                    "last_import": {
                        "imported_at": 1_790_000_000,
                        "source": "hoyoverse",
                        "uid": UID,
                        "server": SERVER,
                        "inserted": 96,
                    },
                },
            })
        );
        assert_eq!(
            serde_json::to_value(Chosen::Cancelled).unwrap(),
            serde_json::json!({ "kind": "cancelled" })
        );
        assert_eq!(
            serde_json::to_value(Failure::RestoreRefused(Refusal::NotDatabase)).unwrap(),
            serde_json::json!({ "kind": "restore_refused", "code": "not_database" })
        );
    }
}
