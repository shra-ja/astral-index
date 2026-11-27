//! The file dialogs the Rust side opens, so no command takes a path from the
//! webview: the system's, or for the mock debug binary an answer from its data
//! folder.
use super::Failure;
#[cfg(test)]
use super::tests::{blocking::spawn_blocking, chooser};
#[cfg(test)]
use crate::tests::filesystem as fs;
use chooser::{DialogExt, FilePath};
#[cfg(not(test))]
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;
#[cfg(not(test))]
use tokio::task::spawn_blocking;

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

/// The file a dialog chose: the user's choice in `system`, the system's dialog, or
/// the mock's answer from `answer_file` in `folder`; none when the dialog is closed.
/// A choice that is not a local file fails with `failure`.
pub(super) fn ask(
    dialogs: Dialogs,
    folder: Option<&Path>,
    answer_file: &str,
    failure: Failure,
    system: impl FnOnce() -> Option<FilePath>,
) -> Result<Option<PathBuf>, Failure> {
    match dialogs {
        Dialogs::System => system()
            .map(|chosen| chosen.into_path().map_err(|_| failure))
            .transpose(),
        Dialogs::Answering => Ok(answer(folder, answer_file)),
    }
}

/// A command's save dialog.
pub(super) struct SaveDialog {
    /// The file in the data folder from which the mock debug binary answers.
    pub answer: &'static str,
    /// The file type offered, and its extension.
    pub filter: &'static str,
    pub extension: &'static str,
    /// The failure for a choice that is not a local file, or a fault in the dialog.
    pub failure: Failure,
}

/// Where to save: the user's choice in the system's save dialog, suggesting
/// `name`, or the mock's answer from the data folder `folder`; none when the dialog
/// is closed. The dialog blocks, so it runs off the async workers. A choice that is
/// not a local file, or a fault in the dialog, fails with the dialog's failure
/// rather than passing for a cancellation.
pub(super) async fn save_as<R: Runtime>(
    app: AppHandle<R>,
    dialogs: Dialogs,
    folder: Option<PathBuf>,
    dialog: SaveDialog,
    name: String,
) -> Result<Option<PathBuf>, Failure> {
    let SaveDialog {
        answer,
        filter,
        extension,
        failure,
    } = dialog;
    let fault = failure.clone();
    spawn_blocking(move || {
        ask(dialogs, folder.as_deref(), answer, failure, || {
            app.dialog()
                .file()
                .set_file_name(name)
                .add_filter(filter, &[extension])
                .blocking_save_file()
        })
    })
    .await
    .map_err(|_| fault)?
}

/// The mock's answer to a dialog: the path in the data folder's `file`, if any.
fn answer(folder: Option<&Path>, file: &str) -> Option<PathBuf> {
    folder
        .and_then(|folder| fs::read_to_string(folder.join(file)).ok())
        .map(|answer| PathBuf::from(answer.trim_end()))
}

/// A chosen file's name, which is all of it that crosses IPC; a choice without
/// one fails with `failure`.
pub(super) fn file_name(path: &Path, failure: Failure) -> Result<String, Failure> {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or(failure)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::filesystem::{self, Fixture as Files};
    use chooser::{Asked, Fixture as Answers};
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

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
        PathBuf::from("/saved/notes.txt")
    }
    /// Ask through a synthetic save dialog for a text file.
    fn save(dialogs: Dialogs, folder: Option<PathBuf>) -> Result<Option<PathBuf>, Failure> {
        let dialog = SaveDialog {
            answer: "save-notes.txt",
            filter: "Notes",
            extension: "txt",
            failure: Failure::Internal,
        };
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(save_as(app(), dialogs, folder, dialog, "notes.txt".into()))
    }
    fn asked() -> Vec<Asked> {
        chooser::inspect(|state| state.asked.clone())
    }

    #[test]
    fn the_save_dialog_suggests_the_name_and_type_and_returns_the_chosen_file() {
        chooser::install(Answers {
            answer: Some(FilePath::Path(target())),
            ..Default::default()
        });
        assert_eq!(save(Dialogs::System, Some(folder())), Ok(Some(target())));
        assert_eq!(
            asked(),
            [Asked {
                opening: false,
                file_name: "notes.txt".into(),
                filter: "Notes".into(),
                extensions: vec!["txt".into()],
            }]
        );
        // Closing the dialog chooses nothing.
        chooser::install(Answers::default());
        assert_eq!(save(Dialogs::System, Some(folder())), Ok(None));
    }

    #[test]
    fn a_choice_that_is_not_a_local_file_or_a_fault_fails_rather_than_cancels() {
        chooser::install(Answers {
            answer: Some(FilePath::Url(
                "https://example.com/notes.txt".parse().unwrap(),
            )),
            ..Default::default()
        });
        assert_eq!(save(Dialogs::System, None), Err(Failure::Internal));
        chooser::install(Answers {
            crash: true,
            ..Default::default()
        });
        assert_eq!(save(Dialogs::System, None), Err(Failure::Internal));
    }

    #[test]
    fn the_mock_answers_from_its_data_folder_and_otherwise_cancels() {
        let answer = format!("{}\n", target().display());
        filesystem::install(Files {
            files: [(folder().join("save-notes.txt"), answer.into_bytes())].into(),
            ..Default::default()
        });
        chooser::install(Answers::default());
        assert_eq!(save(Dialogs::Answering, Some(folder())), Ok(Some(target())));
        // It never opens the real dialog.
        assert_eq!(asked(), []);
        filesystem::install(Files::default());
        assert_eq!(save(Dialogs::Answering, Some(folder())), Ok(None));
        assert_eq!(save(Dialogs::Answering, None), Ok(None));
    }
}
