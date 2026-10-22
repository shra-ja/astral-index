//! The file dialogs the Rust side opens, so no command takes a path from the
//! webview: the system's, or for the mock debug binary an answer from its data
//! folder.
use super::Failure;
#[cfg(test)]
use super::tests::chooser;
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use chooser::FilePath;
#[cfg(not(test))]
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use tauri_plugin_dialog as chooser;

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
