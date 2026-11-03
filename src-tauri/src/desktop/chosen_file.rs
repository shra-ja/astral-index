//! Files the Import screen reads, chosen in a dialog the Rust side opens
//! ([decision 0034](../../../docs/architecture/decisions/0034-native-cache-file-dialog.md)).
//! Only a chosen file's name crosses IPC: its path is held here until a command
//! reads it, so its bytes never enter the webview.
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
use super::{
    Failure,
    database::Database,
    dialogs::{Dialogs, ask, file_name},
};
use chooser::DialogExt;
use serde::Serialize;
use std::{
    ops::Deref,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};
use tauri::{AppHandle, Runtime, State};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// What a chosen file is for, which sets how it is asked for.
struct Purpose {
    /// The file in which the mock debug binary's tests name the file to choose;
    /// without it, the open dialog counts as cancelled.
    answer: &'static str,
    /// The open dialog's filter name and extensions; none offers any file.
    filter: Option<(&'static str, &'static [&'static str])>,
}
/// The game's web cache, `data_2`, which has no extension to filter by.
const CACHE: Purpose = Purpose {
    answer: "cache-from.txt",
    filter: None,
};
/// A UIGF history file, which is JSON.
const HISTORY: Purpose = Purpose {
    answer: "history-from.txt",
    filter: Some(("UIGF history file", &["json"])),
};

/// A file chosen last, until a command reads it.
#[derive(Default)]
pub struct ChosenFile(Mutex<Option<PathBuf>>);
impl ChosenFile {
    pub(super) fn hold(&self, path: PathBuf) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(path);
    }
    /// The chosen file, which is no longer held.
    pub(super) fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

/// The cache file chosen last, until the import reads it.
#[derive(Default)]
pub struct CacheFile(ChosenFile);
impl Deref for CacheFile {
    type Target = ChosenFile;
    fn deref(&self) -> &ChosenFile {
        &self.0
    }
}

/// The history file chosen last, until the import reads it.
#[derive(Default)]
pub struct HistoryFile(ChosenFile);
impl Deref for HistoryFile {
    type Target = ChosenFile;
    fn deref(&self) -> &ChosenFile {
        &self.0
    }
}

/// What became of choosing a file.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum FileChoice {
    /// Chosen and held: its file name; its folder is not sent.
    Chosen { name: String },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The file to read: the user's choice in the open dialog, or the mock's answer;
/// none when the dialog is closed. A choice that is not a local file fails.
fn choose<R: Runtime>(
    app: &AppHandle<R>,
    dialogs: Dialogs,
    folder: Option<&Path>,
    purpose: &Purpose,
) -> Result<Option<PathBuf>, Failure> {
    ask(
        dialogs,
        folder,
        purpose.answer,
        Failure::InvalidFile,
        || {
            let dialog = app.dialog().file();
            match purpose.filter {
                Some((name, extensions)) => dialog.add_filter(name, extensions),
                None => dialog,
            }
            .blocking_pick_file()
        },
    )
}

/// Ask which file to read, off the async workers as the dialog blocks, and hold it
/// in `held`.
async fn choose_into<R: Runtime>(
    app: AppHandle<R>,
    dialogs: Dialogs,
    database: &Database,
    held: &ChosenFile,
    purpose: &'static Purpose,
) -> Result<FileChoice, Failure> {
    let folder = database.folder().map(Path::to_owned);
    let chosen = spawn_blocking(move || choose(&app, dialogs, folder.as_deref(), purpose))
        .await
        .map_err(|_| Failure::InvalidFile)??;
    let Some(path) = chosen else {
        return Ok(FileChoice::Cancelled);
    };
    let name = file_name(&path, Failure::InvalidFile)?;
    held.hold(path);
    Ok(FileChoice::Chosen { name })
}

/// Chooses the cache file to import from; reads nothing and never contacts
/// HoYoverse.
#[tauri::command]
pub async fn choose_cache_file<R: Runtime>(
    app: AppHandle<R>,
    dialogs: State<'_, Dialogs>,
    database: State<'_, Database>,
    cache: State<'_, CacheFile>,
) -> Result<FileChoice, Failure> {
    choose_into(app, *dialogs, &database, &cache, &CACHE).await
}

/// Chooses the history file to import from; reads nothing.
#[tauri::command]
pub async fn choose_history_file<R: Runtime>(
    app: AppHandle<R>,
    dialogs: State<'_, Dialogs>,
    database: State<'_, Database>,
    history: State<'_, HistoryFile>,
) -> Result<FileChoice, Failure> {
    choose_into(app, *dialogs, &database, &history, &HISTORY).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};
    use chooser::{Asked, FilePath, Fixture as Answers};
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

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
    fn cache() -> PathBuf {
        PathBuf::from("/games/StarRail_Data/webCaches/2.5.0.0/Cache/Cache_Data/data_2")
    }
    fn answering(answer: Option<FilePath>) {
        chooser::install(Answers {
            answer,
            ..Default::default()
        });
    }
    fn choose_now(dialogs: Dialogs, cache: &CacheFile) -> Result<FileChoice, Failure> {
        run(choose_into(
            app(),
            dialogs,
            &Database::new(Some(folder())),
            cache,
            &CACHE,
        ))
    }

    #[test]
    fn the_open_dialog_offers_any_file_and_holds_the_chosen_one() {
        filesystem::install(Files::default());
        answering(Some(FilePath::Path(cache())));
        let held = CacheFile::default();
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Ok(FileChoice::Chosen {
                name: "data_2".into()
            })
        );
        // Opened to choose an existing file, with no filter, as data_2 has no
        // extension; nothing is read.
        assert_eq!(
            chooser::inspect(|state| state.asked.clone()),
            [Asked {
                opening: true,
                ..Default::default()
            }]
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        // The path is held for the import, once.
        assert_eq!(held.take(), Some(cache()));
        assert_eq!(held.take(), None);
        assert_eq!(
            serde_json::to_value(FileChoice::Chosen {
                name: "data_2".into()
            })
            .unwrap(),
            serde_json::json!({ "kind": "chosen", "name": "data_2" })
        );
    }

    #[test]
    fn the_history_file_dialog_offers_uigf_files_and_the_mock_has_its_own_answer() {
        filesystem::install(Files::default());
        let file = PathBuf::from("/exports/history.json");
        answering(Some(FilePath::Path(file.clone())));
        let held = HistoryFile::default();
        let chosen = run(choose_into(
            app(),
            Dialogs::System,
            &Database::new(Some(folder())),
            &held,
            &HISTORY,
        ));
        assert_eq!(
            chosen,
            Ok(FileChoice::Chosen {
                name: "history.json".into()
            })
        );
        assert_eq!(
            chooser::inspect(|state| state.asked.clone()),
            [Asked {
                opening: true,
                filter: "UIGF history file".into(),
                extensions: vec!["json".into()],
                ..Default::default()
            }]
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(held.take(), Some(file));
        assert_ne!(HISTORY.answer, CACHE.answer);
    }

    #[test]
    fn closing_the_dialog_chooses_nothing_and_keeps_what_was_held() {
        answering(None);
        let held = CacheFile::default();
        held.hold(cache());
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Ok(FileChoice::Cancelled)
        );
        assert_eq!(held.take(), Some(cache()));
        assert_eq!(
            serde_json::to_value(FileChoice::Cancelled).unwrap(),
            serde_json::json!({ "kind": "cancelled" })
        );
    }

    #[test]
    fn a_choice_that_is_not_a_local_file_or_a_faulty_dialog_fails() {
        let held = CacheFile::default();
        answering(Some(FilePath::Url(
            "https://example.com/data_2".parse().unwrap(),
        )));
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Err(Failure::InvalidFile)
        );
        answering(Some(FilePath::Path(PathBuf::from("/"))));
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Err(Failure::InvalidFile)
        );
        chooser::install(Answers {
            crash: true,
            ..Default::default()
        });
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Err(Failure::InvalidFile)
        );
        assert_eq!(held.take(), None);
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let answer = format!("{}\n", cache().display());
        filesystem::install(Files {
            files: [(folder().join(CACHE.answer), answer.into_bytes())].into(),
            ..Default::default()
        });
        answering(None);
        let held = CacheFile::default();
        assert_eq!(
            choose_now(Dialogs::Answering, &held),
            Ok(FileChoice::Chosen {
                name: "data_2".into()
            })
        );
        assert_eq!(held.take(), Some(cache()));
        // It never opens the real dialog.
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        filesystem::install(Files::default());
        assert_eq!(
            choose_now(Dialogs::Answering, &held),
            Ok(FileChoice::Cancelled)
        );
        let nowhere = run(choose_into(
            app(),
            Dialogs::Answering,
            &Database::new(None),
            &held,
            &CACHE,
        ));
        assert_eq!(nowhere, Ok(FileChoice::Cancelled));
    }
}
