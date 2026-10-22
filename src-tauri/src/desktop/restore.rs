//! The Backup & Restore screen's restore commands
//! ([decision 0031](../../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
//! A backup is untrusted input: it is chosen in a dialog the Rust side opens, copied
//! into the data folder and checked there, and held for the confirmation. Nothing
//! of the history changes until the restore is confirmed.
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
use super::{
    Failure, Session,
    backup::{Dialogs, answer, publish, real},
    database::{self, Database},
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
use tauri::{
    AppHandle, Manager, RunEvent, Runtime, State,
    plugin::{Builder as PluginBuilder, TauriPlugin},
};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// The file in which the mock debug binary's tests name the backup to restore;
/// without it, the open dialog counts as cancelled.
pub const ANSWER: &str = "restore-from.txt";
/// The held copy's name in the data folder. Only the held copy uses it, so a file of
/// that name is always the app's own, left by an earlier run, and is replaced.
const HELD: &str = "restore.sqlite.partial";

/// The checked copy of the backup being restored, in the data folder, until it is
/// restored, cancelled or another backup is chosen.
#[derive(Default)]
pub struct Restore {
    state: Mutex<Holding>,
}
#[derive(Default)]
struct Holding {
    held: Option<Held>,
    /// Whether a confirmed restore is putting its copy in place, under the one name
    /// a new choice would copy to.
    confirming: bool,
}
/// A checked copy and what the history held when the confirmation was shown, if
/// it could be read.
struct Held {
    copy: PathBuf,
    current: Option<Contents>,
}
/// Marks a confirmed restore as putting its copy in place until dropped.
struct Confirming<'a>(&'a Restore);
impl Drop for Confirming<'_> {
    fn drop(&mut self) {
        self.0.state().confirming = false;
    }
}
impl Restore {
    fn state(&self) -> std::sync::MutexGuard<'_, Holding> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
    /// Hold `copy` in place of any earlier copy, which is removed.
    fn hold(&self, copy: Option<Held>) {
        if let Some(earlier) = std::mem::replace(&mut self.state().held, copy) {
            let _ = fs::remove_file(earlier.copy);
        }
    }
    /// Make way for a newly chosen backup: drop the copy held earlier, unless a
    /// confirmed restore is putting its copy in place, which the new copy would
    /// replace.
    fn release(&self) -> Result<(), Failure> {
        let earlier = {
            let mut state = self.state();
            if state.confirming {
                return Err(Failure::RestoreFailed);
            }
            state.held.take()
        };
        if let Some(earlier) = earlier {
            let _ = fs::remove_file(earlier.copy);
        }
        Ok(())
    }
    /// Take the held copy for restoring, marking the restore as confirming until
    /// the guard is dropped; nothing is held from then on.
    fn take(&self) -> Option<(Held, Confirming<'_>)> {
        let mut state = self.state();
        let held = state.held.take()?;
        state.confirming = true;
        Some((held, Confirming(self)))
    }
}

/// Remove a copy an earlier run held when the app closed or crashed, so it takes no
/// space. Only the held copy's name is removed; nothing else in the data folder is
/// looked at.
pub fn remove_leftovers(folder: Option<&Path>) {
    if let Some(folder) = folder {
        let _ = fs::remove_file(folder.join(HELD));
    }
}

/// Drops a held copy as the app exits, as cancelling does, rather than leaving it
/// until the next start; startup still removes one that a crash left.
pub fn clean_up_on_exit<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("restore-clean-up")
        .on_event(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Restore>().hold(None);
            }
        })
        .build()
}

/// What became of choosing a backup to restore.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Chosen {
    /// Checked and held: the backup's file name, what it holds and what the current
    /// history holds, for the confirmation; none when the history is from an older
    /// release and couldn't be upgraded, so can't be read. Its folder is not sent.
    Checked {
        name: String,
        backup: Contents,
        current: Option<Contents>,
    },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The backup to restore: the user's choice in the open dialog, or the mock's
/// answer; none when the dialog is closed. A choice that is not a local file fails.
fn choose<R: Runtime>(
    app: &AppHandle<R>,
    dialogs: Dialogs,
    folder: &Path,
) -> Result<Option<PathBuf>, Failure> {
    match dialogs {
        Dialogs::System => app
            .dialog()
            .file()
            .add_filter("Astral Index backup", &["sqlite"])
            .blocking_pick_file()
            .map(|chosen| chosen.into_path().map_err(|_| Failure::RestoreFailed))
            .transpose(),
        Dialogs::Answering => Ok(answer(Some(folder), ANSWER)),
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

/// Copy `source` into the data folder under the held copy's name, replacing any copy
/// left there, check it as untrusted input, open it, which brings it to the current
/// schema, and read what it holds. Any failure removes the copy.
pub fn hold_copy(folder: &Path, source: &Path) -> Result<(PathBuf, Contents), Failure> {
    let copy = folder.join(HELD);
    let _ = fs::remove_file(&copy);
    let mut file = fs::File::create_new(&copy).map_err(|_| Failure::RestoreFailed)?;
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

/// Whether `chosen` is the history file itself, compared by their real paths, so no
/// other form of its path passes for another file. Anything else in the data
/// folder, such as a safety copy, may be restored, as it is checked as any backup
/// is.
pub fn is_history(history: &Path, chosen: &Path) -> bool {
    real(history) == real(chosen)
}

/// Ask which backup to restore, off the async workers as the dialog blocks, then
/// copy, check and hold it, and read the current history to compare.
async fn choose_into<R: Runtime>(
    app: AppHandle<R>,
    session: &Session,
    dialogs: Dialogs,
    restore: &Restore,
    database: &Database,
) -> Result<Chosen, Failure> {
    // An import would be saved into a history it was not counted against.
    if session.importing() {
        return Err(Failure::ImportUnderWay);
    }
    // Without a data folder there is nowhere to check a copy, so nothing is asked.
    let (folder, history) = database
        .folder()
        .map(Path::to_owned)
        .zip(database.path())
        .ok_or(Failure::RestoreFailed)?;
    let asking = folder.clone();
    let chosen = spawn_blocking(move || choose(&app, dialogs, &asking))
        .await
        .map_err(|_| Failure::RestoreFailed)??;
    let Some(source) = chosen else {
        return Ok(Chosen::Cancelled);
    };
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(Failure::RestoreFailed)?;
    if is_history(&history, &source) {
        return Err(Failure::RestoreIsHistory);
    }
    // The held copy is the app's own working file, which choosing it would empty.
    if real(&folder.join(HELD)) == real(&source) {
        return Err(Failure::RestoreRefused(Refusal::NotDatabase));
    }
    // Another backup was chosen, so the one held earlier is no longer shown.
    restore.release()?;
    let (copy, contents) = spawn_blocking(move || hold_copy(&folder, &source))
        .await
        .map_err(|_| Failure::RestoreFailed)??;
    let current = match database
        .run(|store| store.contents())
        .await
        .and_then(|read| read)
    {
        Ok(current) => Ok(Some(current)),
        Err(crate::storage::Error::NotUpgraded(_)) => Ok(None),
        Err(error) => Err(error),
    };
    match current {
        Ok(current) => {
            restore.hold(Some(Held {
                copy,
                current: current.clone(),
            }));
            Ok(Chosen::Checked {
                name,
                backup: contents,
                current,
            })
        }
        Err(error) => {
            let _ = fs::remove_file(&copy);
            Err(error.into())
        }
    }
}

/// Chooses a backup to restore and checks it, changing nothing of the history;
/// never contacts HoYoverse.
#[tauri::command]
pub async fn choose_restore<R: Runtime>(
    app: AppHandle<R>,
    session: State<'_, Session>,
    dialogs: State<'_, Dialogs>,
    restore: State<'_, Restore>,
    database: State<'_, Database>,
) -> Result<Chosen, Failure> {
    choose_into(app, &session, *dialogs, &restore, &database).await
}

/// Drops the held copy of the backup, if any; the history is unchanged.
#[tauri::command]
pub fn cancel_restore(restore: State<'_, Restore>) {
    restore.hold(None);
}

/// What restoring did: the name the previous history was kept under in the data
/// folder, if there was any history to keep. Its folder is not sent.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Restored {
    pub safety_copy: Option<String>,
}

/// Replaces the history with the held backup, keeping the history as it was in a
/// safety copy named from `time`, the webview's local time; never contacts
/// HoYoverse.
#[tauri::command]
pub async fn confirm_restore(
    session: State<'_, Session>,
    restore: State<'_, Restore>,
    database: State<'_, Database>,
    time: String,
) -> Result<Restored, Failure> {
    restore_into(&session, &restore, &database, &time).await
}

/// The safety copy's name for a restore at `time`, the webview's local time as
/// `YYYY-MM-DDTHH:MM:SS`, if it is a real time in exactly that form.
fn safety_name(time: &str) -> Result<String, Failure> {
    chrono::NaiveDateTime::parse_from_str(time, "%Y-%m-%dT%H:%M:%S")
        .ok()
        .filter(|parsed| parsed.format("%Y-%m-%dT%H:%M:%S").to_string() == time)
        .map(|parsed| {
            format!(
                "history-before-restore-{}.sqlite",
                parsed.format("%Y%m%d-%H%M%S")
            )
        })
        .ok_or(Failure::InvalidRequest)
}

/// Keep the history under `safety`, when given, then flush the checked copy and
/// give it the history's name. A failure removes the safety copy again.
pub fn put_in_place(
    history: &Path,
    copy: &Path,
    safety: Option<String>,
) -> Result<Restored, Failure> {
    let kept = safety.map(|name| history.with_file_name(name));
    if let Some(kept) = &kept {
        database::copy_new(history, kept).map_err(|_| Failure::RestoreFailed)?;
    }
    if publish(copy, history).is_err() {
        if let Some(kept) = &kept {
            let _ = fs::remove_file(kept);
        }
        return Err(Failure::RestoreFailed);
    }
    Ok(Restored {
        safety_copy: kept.map(|kept| kept.file_name().unwrap().to_string_lossy().into_owned()),
    })
}

/// What the history holds, read as the store closes, so its file can be replaced.
fn read_and_close(store: Store) -> Result<Contents, crate::storage::Error> {
    store.contents()
}

/// With the store handed over, read the history once more and, if it is what the
/// confirmation showed, close it and put the checked copy in its place, keeping a
/// safety copy of any history first. A history handed over unopened, as it
/// couldn't be upgraded, can't be read, so it is kept as it is.
fn replace(
    store: Option<Store>,
    history: &Path,
    held: Held,
    safety: String,
) -> Result<Restored, Failure> {
    let current = store
        .map(read_and_close)
        .transpose()
        .map_err(|_| Failure::Storage)?;
    if current != held.current {
        return Err(Failure::RestoreChanged);
    }
    let kept = current.is_none_or(|current| !current.accounts.is_empty());
    put_in_place(history, &held.copy, kept.then_some(safety))
}

/// Replace the history with the held copy at `time`, which names the safety copy.
/// Confirming uses up the held copy, whatever the outcome; the store reopens the
/// restored history when next used.
async fn restore_into(
    session: &Session,
    restore: &Restore,
    database: &Database,
    time: &str,
) -> Result<Restored, Failure> {
    let (held, _confirming) = restore.take().ok_or(Failure::RestoreFailed)?;
    let copy = held.copy.clone();
    let refused = if session.importing() {
        Err(Failure::ImportUnderWay)
    } else {
        safety_name(time)
    };
    let restored = match refused {
        Ok(safety) => database
            .replace(move |store, history| replace(store, history, held, safety))
            .await
            .unwrap_or_else(|error| Err(error.into())),
        Err(failure) => Err(failure),
    };
    // Whatever went wrong, the checked copy is not kept.
    if restored.is_err() {
        let _ = fs::remove_file(&copy);
    }
    restored
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};
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
    /// Where the held copy is kept: one name in the data folder that only it uses.
    fn held() -> PathBuf {
        folder().join("restore.sqlite.partial")
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
            current: Some(contents(0)),
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
        run(choose_into(
            app(),
            &Session::default(),
            Dialogs::System,
            restore,
            &database(),
        ))
    }
    fn has(path: &Path) -> bool {
        filesystem::inspect(|state| state.files.contains_key(path))
    }
    fn holding(restore: &Restore) -> Option<PathBuf> {
        restore.state().held.as_ref().map(|held| held.copy.clone())
    }
    /// Hold the copy, as choosing it leaves it, compared with `current`.
    fn holding_copy(restore: &Restore, current: Contents) {
        holding_shown(restore, Some(current));
    }
    /// Hold the copy as if the confirmation showed `current`, or no history.
    fn holding_shown(restore: &Restore, current: Option<Contents>) {
        restore.state().held = Some(Held {
            copy: held(),
            current,
        });
    }

    #[test]
    fn the_open_dialog_offers_backups_and_returns_the_chosen_file() {
        answering(Some(source()));
        assert_eq!(
            choose(&app(), Dialogs::System, &folder()),
            Ok(Some(source()))
        );
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
        assert_eq!(choose(&app(), Dialogs::System, &folder()), Ok(None));
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/backup.sqlite".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(
            choose(&app(), Dialogs::System, &folder()),
            Err(Failure::RestoreFailed)
        );
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let answer = format!("{}\n", source().display());
        filesystem::install(files(&[(folder().join(ANSWER), answer.as_bytes())]));
        answering(None);
        assert_eq!(
            choose(&app(), Dialogs::Answering, &folder()),
            Ok(Some(source()))
        );
        // It never opens the real dialog.
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        filesystem::install(Files::default());
        assert_eq!(choose(&app(), Dialogs::Answering, &folder()), Ok(None));
    }

    #[test]
    fn a_chosen_backup_is_copied_into_the_data_folder_checked_and_held() {
        filesystem::install(files(&[]));
        answering(Some(source()));
        sql::expect(choosing(&held()));
        let restore = Restore::default();
        assert_eq!(choose_now(&restore), Ok(checked()));
        sql::finish();
        // The copy holds the backup's bytes; the backup itself is untouched, and the
        // only removal is clearing the held copy's name before copying.
        filesystem::inspect(|state| {
            assert_eq!(state.files[&held()], BYTES);
            assert_eq!(state.files[&source()], BYTES);
            assert_eq!(state.removed_files, [held()]);
            assert!(state.renamed.is_empty());
        });
        assert_eq!(holding(&restore), Some(held()));
    }

    #[test]
    fn a_copy_left_behind_is_replaced_by_the_new_one() {
        filesystem::install(files(&[(held(), b"left by an earlier run")]));
        answering(Some(source()));
        sql::expect(choosing(&held()));
        assert_eq!(choose_now(&Restore::default()), Ok(checked()));
        sql::finish();
        filesystem::inspect(|state| {
            assert_eq!(state.removed_files, [held()]);
            assert_eq!(state.files[&held()], BYTES);
        });
    }

    #[test]
    fn cancelling_the_dialog_changes_nothing() {
        filesystem::install(files(&[]));
        answering(None);
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        assert_eq!(choose_now(&restore), Ok(Chosen::Cancelled));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // A copy held earlier is kept for its confirmation.
        assert_eq!(holding(&restore), Some(held()));
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
        assert_eq!(holding(&restore), Some(held()));
    }

    #[test]
    fn the_history_itself_is_refused_before_it_is_read() {
        // However its folder is written, the history is found by its real path.
        let link = PathBuf::from("/home/player/history-link");
        for chosen in [folder(), link.clone()].map(|folder| folder.join("history.sqlite")) {
            filesystem::install(Files {
                links: [(link.clone(), folder())].into(),
                ..files(&[(folder().join("history.sqlite"), BYTES)])
            });
            answering(Some(chosen));
            assert_eq!(
                choose_now(&Restore::default()),
                Err(Failure::RestoreIsHistory)
            );
            filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        }
    }

    #[test]
    fn the_held_copy_itself_is_refused_and_kept_for_its_confirmation() {
        filesystem::install(files(&[(held(), BYTES)]));
        answering(Some(held()));
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        assert_eq!(
            choose_now(&restore),
            Err(Failure::RestoreRefused(Refusal::NotDatabase))
        );
        filesystem::inspect(|state| {
            assert!(state.accessed.is_empty());
            assert_eq!(state.files[&held()], BYTES);
        });
        assert_eq!(holding(&restore), Some(held()));
    }

    #[test]
    fn a_safety_copy_in_the_data_folder_can_be_restored() {
        let safety = folder().join("history-before-restore-20261016-120000.sqlite");
        filesystem::install(files(&[(safety.clone(), BYTES)]));
        answering(Some(safety.clone()));
        sql::expect(choosing(&held()));
        let restore = Restore::default();
        assert_eq!(
            choose_now(&restore),
            Ok(Chosen::Checked {
                name: "history-before-restore-20261016-120000.sqlite".into(),
                backup: contents(1),
                current: Some(contents(0)),
            })
        );
        sql::finish();
        // It is copied and checked as any backup is, and kept as it was.
        filesystem::inspect(|state| {
            assert_eq!(state.files[&held()], BYTES);
            assert_eq!(state.files[&safety], BYTES);
        });
        assert_eq!(holding(&restore), Some(held()));
    }

    #[test]
    fn a_restore_needs_a_data_folder_and_a_file_name() {
        // Without a data folder there is nowhere to check a copy, so no dialog opens.
        filesystem::install(files(&[]));
        answering(Some(source()));
        assert_eq!(
            run(choose_into(
                app(),
                &Session::default(),
                Dialogs::System,
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
                    check_script(&held().to_string_lossy()),
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
                    choosing(&held()),
                    "OPEN",
                    Err(rusqlite::Error::InvalidQuery),
                ),
                Failure::RestoreFailed,
            ),
            // The current history cannot be read.
            (
                files(&[]),
                {
                    let mut steps = choosing(&held());
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
            assert!(!has(&held()), "{failure:?}");
            assert_eq!(holding(&restore), None);
        }
        // When the copy cannot be made there, nothing is read or held.
        filesystem::install(Files {
            directories: vec![held()],
            ..files(&[])
        });
        answering(Some(source()));
        let restore = Restore::default();
        assert_eq!(choose_now(&restore), Err(Failure::RestoreFailed));
        filesystem::inspect(|state| assert_eq!(state.reads, 0));
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn a_copy_left_by_an_earlier_run_is_removed_and_nothing_else() {
        let history = folder().join("history.sqlite");
        let other = folder().join("restore.sqlite.1.partial");
        filesystem::install(files(&[
            (held(), b"left by a quit"),
            (history.clone(), b"the history"),
            (other.clone(), b"not the held copy's name"),
        ]));
        remove_leftovers(Some(&folder()));
        filesystem::inspect(|state| {
            assert_eq!(state.removed_files, [held()]);
            let mut kept = vec![source(), history.clone(), other.clone()];
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
        filesystem::install(files(&[(held(), b"the earlier copy")]));
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        answering(Some(source()));
        // The earlier copy is removed first, then the new one takes its name.
        sql::expect(choosing(&held()));
        assert_eq!(choose_now(&restore), Ok(checked()));
        sql::finish();
        filesystem::inspect(|state| assert_eq!(state.files[&held()], BYTES));
        assert_eq!(holding(&restore), Some(held()));
        // A refused choice drops it too, as the confirmation no longer shows it.
        let mut too_large = files(&[(held(), BYTES)]);
        too_large.lengths = [(source(), MAX_DATABASE_BYTES + 1)].into();
        filesystem::install(too_large);
        answering(Some(source()));
        assert_eq!(
            choose_now(&restore),
            Err(Failure::RestoreRefused(Refusal::TooLarge))
        );
        assert!(!has(&held()));
        assert_eq!(holding(&restore), None);
        // Cancelling the restore removes the held copy; with none, it does nothing.
        filesystem::install(files(&[(held(), BYTES)]));
        holding_copy(&restore, contents(0));
        restore.hold(None);
        assert!(!has(&held()));
        restore.hold(None);
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn closing_the_app_drops_the_held_copy() {
        let mut app = crate::desktop::register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        // The mock runtime runs setup, which opens the window, only on this call.
        #[allow(deprecated)]
        app.run_iteration(crate::desktop::tests::events::ignore);
        filesystem::install(files(&[(held(), BYTES)]));
        holding_copy(&app.state::<Restore>(), contents(0));
        let window = app.get_webview_window("main").unwrap();
        // Closing the last window once running ends the loop, which reports the exit.
        app.run(move |_, event| {
            if let RunEvent::Ready = event {
                window.close().unwrap();
            }
        });
        assert!(!has(&held()));
        assert!(has(&source()));
    }

    #[test]
    fn nothing_is_chosen_while_an_import_is_under_way_or_held() {
        filesystem::install(files(&[]));
        answering(Some(source()));
        let session = Session::default();
        session
            .keep_preview(&session.begin(), crate::storage::tests::preview())
            .unwrap();
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        assert_eq!(
            run(choose_into(
                app(),
                &session,
                Dialogs::System,
                &restore,
                &database()
            )),
            Err(Failure::ImportUnderWay)
        );
        // No dialog opens, nothing is read, and the copy held earlier is kept.
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(holding(&restore), Some(held()));
    }

    #[test]
    fn nothing_is_chosen_while_a_confirmed_restore_puts_its_copy_in_place() {
        filesystem::install(files(&[(held(), b"being put in place")]));
        answering(Some(source()));
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        let confirming = restore.take().unwrap();
        // The new choice would copy to the same name, so it is refused untouched.
        assert_eq!(choose_now(&restore), Err(Failure::RestoreFailed));
        filesystem::inspect(|state| {
            assert_eq!(state.files[&held()], b"being put in place");
            assert!(state.removed_files.is_empty());
        });
        // Once the restore is over, a backup can be chosen again.
        drop(confirming);
        answering(Some(source()));
        sql::expect(choosing(&held()));
        assert_eq!(choose_now(&restore), Ok(checked()));
        sql::finish();
    }

    fn history() -> PathBuf {
        folder().join("history.sqlite")
    }
    fn safety() -> PathBuf {
        folder().join("history-before-restore-20261020-143000.sqlite")
    }
    const TIME: &str = "2026-10-20T14:30:00";
    const CURRENT: &[u8] = b"the current history";
    /// A data folder with the history, the held copy and the files given.
    fn data(extra: &[(PathBuf, &[u8])]) -> Files {
        let mut entries = vec![(history(), CURRENT), (held(), BYTES)];
        entries.extend(extra.iter().cloned());
        Files {
            files: entries
                .into_iter()
                .map(|(path, bytes)| (path, bytes.to_vec()))
                .collect(),
            ..Default::default()
        }
    }
    /// The SQL for reading the history once more, finding `accounts` accounts.
    fn rereading(accounts: usize) -> Vec<Step> {
        reading(&history(), vec![accounts_row(); accounts])
    }
    #[test]
    fn a_backup_restores_over_a_history_that_could_not_be_upgraded() {
        let failed =
            || Database::not_upgraded(folder(), Some("history-v2-20261021-143000.sqlite".into()));
        // Choosing checks the backup, with no current history to compare.
        filesystem::install(files(&[]));
        answering(Some(source()));
        let mut steps = check_script(&held().to_string_lossy());
        steps.extend(reading(&held(), vec![accounts_row()]));
        sql::expect(steps);
        let restore = Restore::default();
        let chosen = run(choose_into(
            app(),
            &Session::default(),
            Dialogs::System,
            &restore,
            &failed(),
        ));
        sql::finish();
        assert_eq!(
            chosen,
            Ok(Chosen::Checked {
                name: "Astral-Index-backup-2026-10-16.sqlite".into(),
                backup: contents(1),
                current: None,
            })
        );
        assert_eq!(holding(&restore), Some(held()));
        // Confirming keeps the history unread, exactly as it is, then puts the
        // backup in its place.
        filesystem::install(data(&[]));
        let outcome = run(restore_into(&Session::default(), &restore, &failed(), TIME));
        assert_eq!(
            outcome,
            Ok(restored(Some(
                "history-before-restore-20261020-143000.sqlite"
            )))
        );
        filesystem::inspect(|state| {
            assert_eq!(state.files[&safety()], CURRENT);
            assert_eq!(state.files[&history()], BYTES);
            assert!(!state.files.contains_key(&held()));
        });
    }

    #[test]
    fn a_history_that_changed_whether_it_can_be_read_is_not_replaced() {
        // Shown as unreadable, then read; or shown, then unreadable.
        for (shown, database) in [
            (None, database()),
            (Some(contents(1)), Database::not_upgraded(folder(), None)),
        ] {
            filesystem::install(data(&[]));
            let opened = shown.is_none();
            if opened {
                sql::expect(rereading(1));
            }
            let restore = Restore::default();
            holding_shown(&restore, shown);
            assert_eq!(
                run(restore_into(&Session::default(), &restore, &database, TIME)),
                Err(Failure::RestoreChanged)
            );
            sql::finish();
            filesystem::inspect(|state| {
                assert_eq!(state.files[&history()], CURRENT);
                assert!(!state.files.contains_key(&held()));
            });
        }
    }

    fn restore_now(session: &Session, restore: &Restore) -> Result<Restored, Failure> {
        run(restore_into(session, restore, &database(), TIME))
    }
    fn restored(safety_copy: Option<&str>) -> Restored {
        Restored {
            safety_copy: safety_copy.map(Into::into),
        }
    }

    #[test]
    fn restoring_keeps_the_history_as_a_safety_copy_then_puts_the_backup_in_place() {
        filesystem::install(data(&[]));
        sql::expect(rereading(1));
        let restore = Restore::default();
        holding_copy(&restore, contents(1));
        assert_eq!(
            restore_now(&Session::default(), &restore),
            Ok(restored(Some(
                "history-before-restore-20261020-143000.sqlite"
            )))
        );
        sql::finish();
        // The safety copy and the checked copy reach the disk before the rename.
        filesystem::inspect(|state| {
            assert_eq!(state.files[&safety()], CURRENT);
            assert_eq!(state.files[&history()], BYTES);
            assert!(!state.files.contains_key(&held()));
            assert_eq!(state.synced, [safety(), held()]);
            assert_eq!(state.renamed, [(held(), history())]);
        });
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn an_empty_history_needs_no_safety_copy() {
        filesystem::install(data(&[]));
        sql::expect(rereading(0));
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        assert_eq!(
            restore_now(&Session::default(), &restore),
            Ok(restored(None))
        );
        sql::finish();
        filesystem::inspect(|state| {
            assert_eq!(state.files.len(), 1);
            assert_eq!(state.files[&history()], BYTES);
        });
    }

    #[test]
    fn a_history_changed_since_the_confirmation_is_not_replaced() {
        filesystem::install(data(&[]));
        sql::expect(rereading(1));
        let restore = Restore::default();
        holding_copy(&restore, contents(0));
        assert_eq!(
            restore_now(&Session::default(), &restore),
            Err(Failure::RestoreChanged)
        );
        sql::finish();
        // The history is as it was, and the held copy is gone.
        filesystem::inspect(|state| {
            assert_eq!(state.files.len(), 1);
            assert_eq!(state.files[&history()], CURRENT);
        });
        assert_eq!(holding(&restore), None);
    }

    #[test]
    fn each_failure_leaves_the_history_as_it_was_and_removes_the_copies() {
        let theirs: &[u8] = b"a file of the user's";
        // The files, the SQL, the failure, and the files left afterwards.
        type Case<'a> = (Files, Vec<Step>, Failure, Vec<(PathBuf, &'a [u8])>);
        // Reading the accounts fails once the history is open.
        let mut unread = rereading(1);
        let accounts = unread
            .iter()
            .position(|step| step.sql.starts_with("PREPARE"))
            .unwrap();
        unread.truncate(accounts + 1);
        unread[accounts].reply = Err(rusqlite::Error::InvalidQuery);
        let cases: Vec<Case> = vec![
            // The history cannot be opened again, or read once open.
            (
                data(&[]),
                ending_at(rereading(1), "OPEN", Err(rusqlite::Error::InvalidQuery)),
                Failure::Storage,
                vec![(history(), CURRENT)],
            ),
            (
                data(&[]),
                unread,
                Failure::Storage,
                vec![(history(), CURRENT)],
            ),
            // A file already has the safety copy's name; it is never touched.
            (
                data(&[(safety(), theirs)]),
                rereading(1),
                Failure::RestoreFailed,
                vec![(history(), CURRENT), (safety(), theirs)],
            ),
            // The safety copy cannot be written, or flushed.
            (
                Files {
                    write_failure: true,
                    ..data(&[])
                },
                rereading(1),
                Failure::RestoreFailed,
                vec![(history(), CURRENT)],
            ),
            (
                Files {
                    sync_failure: true,
                    ..data(&[])
                },
                rereading(1),
                Failure::RestoreFailed,
                vec![(history(), CURRENT)],
            ),
        ];
        for (fixture, steps, failure, kept) in cases {
            filesystem::install(fixture);
            sql::expect(steps);
            let restore = Restore::default();
            holding_copy(&restore, contents(1));
            assert_eq!(
                restore_now(&Session::default(), &restore),
                Err(failure.clone())
            );
            sql::finish();
            let kept: std::collections::BTreeMap<PathBuf, Vec<u8>> = kept
                .into_iter()
                .map(|(path, bytes)| (path, bytes.to_vec()))
                .collect();
            filesystem::inspect(|state| assert_eq!(state.files, kept, "{failure:?}"));
            assert_eq!(holding(&restore), None);
        }
        // The checked copy cannot take the history's place: any safety copy goes too.
        for accounts in [1, 0] {
            filesystem::install(Files {
                directories: vec![history()],
                ..data(&[])
            });
            sql::expect(rereading(accounts));
            let restore = Restore::default();
            holding_copy(&restore, contents(accounts));
            assert_eq!(
                restore_now(&Session::default(), &restore),
                Err(Failure::RestoreFailed)
            );
            sql::finish();
            filesystem::inspect(|state| {
                assert_eq!(state.renamed, [(held(), history())]);
                assert_eq!(state.files.len(), 1);
                assert_eq!(state.files[&history()], CURRENT);
            });
        }
    }

    #[test]
    fn nothing_is_replaced_while_importing_without_a_held_copy_or_at_an_unreal_time() {
        // A held import refuses the restore and uses up the held copy.
        filesystem::install(data(&[]));
        sql::expect(vec![]);
        let session = Session::default();
        session
            .keep_preview(&session.begin(), crate::storage::tests::preview())
            .unwrap();
        let restore = Restore::default();
        holding_copy(&restore, contents(1));
        assert_eq!(
            restore_now(&session, &restore),
            Err(Failure::ImportUnderWay)
        );
        // With nothing held there is nothing to restore.
        assert_eq!(
            restore_now(&Session::default(), &restore),
            Err(Failure::RestoreFailed)
        );
        // The time names the safety copy, so it must be a real one, exactly so.
        for time in [
            "",
            "2026-10-20 14:30:00",
            "2026-02-30T14:30:00",
            "2026-10-20T24:00:00",
            "2026-10-20T14:30",
            "2026-10-20T14:30:00Z",
        ] {
            filesystem::install(data(&[]));
            holding_copy(&restore, contents(1));
            assert_eq!(
                run(restore_into(
                    &Session::default(),
                    &restore,
                    &database(),
                    time
                )),
                Err(Failure::InvalidRequest),
                "{time}"
            );
            assert_eq!(holding(&restore), None);
        }
        sql::finish();
        filesystem::inspect(|state| {
            assert_eq!(state.files.len(), 1);
            assert_eq!(state.files[&history()], CURRENT);
        });
        // Without a data folder nothing is read.
        filesystem::install(data(&[]));
        holding_copy(&restore, contents(1));
        assert_eq!(
            run(restore_into(
                &Session::default(),
                &restore,
                &Database::new(None),
                TIME
            )),
            Err(Failure::Storage)
        );
        filesystem::inspect(|state| assert!(!state.files.contains_key(&held())));
    }

    #[test]
    fn the_webview_learns_the_safety_copy_name_and_never_a_path() {
        assert_eq!(
            serde_json::to_value(restored(Some(
                "history-before-restore-20261020-143000.sqlite"
            )))
            .unwrap(),
            serde_json::json!({ "safety_copy": "history-before-restore-20261020-143000.sqlite" })
        );
        assert_eq!(
            serde_json::to_value(restored(None)).unwrap(),
            serde_json::json!({ "safety_copy": null })
        );
        assert_eq!(
            serde_json::to_value(Failure::RestoreChanged).unwrap(),
            serde_json::json!({ "kind": "restore_changed" })
        );
        assert_eq!(
            serde_json::to_value(Failure::ImportUnderWay).unwrap(),
            serde_json::json!({ "kind": "import_under_way" })
        );
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
