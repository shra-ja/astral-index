//! The Import screen's cache file, chosen in a dialog the Rust side opens
//! ([decision 0034](../../../docs/architecture/decisions/0034-native-cache-file-dialog.md)).
//! Only its name crosses IPC: the path is held here until `extract_from_file`
//! reads the file, so its bytes never enter the webview.
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
use super::{
    Failure,
    backup::{Dialogs, answer},
    database::Database,
};
use chooser::DialogExt;
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};
use tauri::{AppHandle, Runtime, State};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// The file in which the mock debug binary's tests name the cache file to choose;
/// without it, the open dialog counts as cancelled.
pub const ANSWER: &str = "cache-from.txt";

/// The cache file chosen last, until the import reads it.
#[derive(Default)]
pub struct CacheFile(Mutex<Option<PathBuf>>);
impl CacheFile {
    pub(super) fn hold(&self, path: PathBuf) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(path);
    }
    /// The chosen file, which is no longer held.
    pub(super) fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

/// What became of choosing a cache file.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CacheChoice {
    /// Chosen and held: its file name; its folder is not sent.
    Chosen { name: String },
    /// The dialog was closed without choosing a file.
    Cancelled,
}

/// The cache file to read: the user's choice in the open dialog, which has no
/// filter as `data_2` has no extension, or the mock's answer; none when the dialog
/// is closed. A choice that is not a local file fails.
fn choose<R: Runtime>(
    app: &AppHandle<R>,
    dialogs: Dialogs,
    folder: Option<&Path>,
) -> Result<Option<PathBuf>, Failure> {
    match dialogs {
        Dialogs::System => app
            .dialog()
            .file()
            .blocking_pick_file()
            .map(|chosen| chosen.into_path().map_err(|_| Failure::InvalidFile))
            .transpose(),
        Dialogs::Answering => Ok(answer(folder, ANSWER)),
    }
}

/// Ask which cache file to read, off the async workers as the dialog blocks, and
/// hold it for the import.
async fn choose_into<R: Runtime>(
    app: AppHandle<R>,
    dialogs: Dialogs,
    database: &Database,
    cache: &CacheFile,
) -> Result<CacheChoice, Failure> {
    let folder = database.folder().map(Path::to_owned);
    let chosen = spawn_blocking(move || choose(&app, dialogs, folder.as_deref()))
        .await
        .map_err(|_| Failure::InvalidFile)??;
    let Some(path) = chosen else {
        return Ok(CacheChoice::Cancelled);
    };
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(Failure::InvalidFile)?;
    cache.hold(path);
    Ok(CacheChoice::Chosen { name })
}

/// Chooses the cache file to import from; reads nothing and never contacts
/// HoYoverse.
#[tauri::command]
pub async fn choose_cache_file<R: Runtime>(
    app: AppHandle<R>,
    dialogs: State<'_, Dialogs>,
    database: State<'_, Database>,
    cache: State<'_, CacheFile>,
) -> Result<CacheChoice, Failure> {
    choose_into(app, *dialogs, &database, &cache).await
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
    fn choose_now(dialogs: Dialogs, cache: &CacheFile) -> Result<CacheChoice, Failure> {
        run(choose_into(
            app(),
            dialogs,
            &Database::new(Some(folder())),
            cache,
        ))
    }

    #[test]
    fn the_open_dialog_offers_any_file_and_holds_the_chosen_one() {
        filesystem::install(Files::default());
        answering(Some(FilePath::Path(cache())));
        let held = CacheFile::default();
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Ok(CacheChoice::Chosen {
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
            serde_json::to_value(CacheChoice::Chosen {
                name: "data_2".into()
            })
            .unwrap(),
            serde_json::json!({ "kind": "chosen", "name": "data_2" })
        );
    }

    #[test]
    fn closing_the_dialog_chooses_nothing_and_keeps_what_was_held() {
        answering(None);
        let held = CacheFile::default();
        held.hold(cache());
        assert_eq!(
            choose_now(Dialogs::System, &held),
            Ok(CacheChoice::Cancelled)
        );
        assert_eq!(held.take(), Some(cache()));
        assert_eq!(
            serde_json::to_value(CacheChoice::Cancelled).unwrap(),
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
            files: [(folder().join(ANSWER), answer.into_bytes())].into(),
            ..Default::default()
        });
        answering(None);
        let held = CacheFile::default();
        assert_eq!(
            choose_now(Dialogs::Answering, &held),
            Ok(CacheChoice::Chosen {
                name: "data_2".into()
            })
        );
        assert_eq!(held.take(), Some(cache()));
        // It never opens the real dialog.
        assert_eq!(chooser::inspect(|state| state.asked.len()), 0);
        filesystem::install(Files::default());
        assert_eq!(
            choose_now(Dialogs::Answering, &held),
            Ok(CacheChoice::Cancelled)
        );
        let nowhere = run(choose_into(
            app(),
            Dialogs::Answering,
            &Database::new(None),
            &held,
        ));
        assert_eq!(nowhere, Ok(CacheChoice::Cancelled));
    }
}
