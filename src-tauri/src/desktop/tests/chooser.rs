//! Test double for the dialog plugin's save dialog. Unit tests never open a dialog:
//! what it would show is recorded, and the fixture's answer returned once.
use std::cell::RefCell;
use tauri::{AppHandle, Runtime};
pub use tauri_plugin_dialog::FilePath;

/// What a save dialog was asked to show.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Asked {
    pub file_name: String,
    pub filter: String,
    pub extensions: Vec<String>,
}

#[derive(Default)]
pub struct Fixture {
    /// The file the user chooses; none closes the dialog without choosing.
    pub answer: Option<FilePath>,
    /// Every dialog shown, in order.
    pub asked: Vec<Asked>,
}
thread_local! { static FIXTURE: RefCell<Fixture> = RefCell::default(); }
pub fn install(fixture: Fixture) {
    FIXTURE.with(|state| *state.borrow_mut() = fixture);
}
pub fn inspect<T>(inspect: impl FnOnce(&Fixture) -> T) -> T {
    FIXTURE.with(|state| inspect(&state.borrow()))
}

pub trait DialogExt {
    fn dialog(&self) -> &Dialog;
}
impl<R: Runtime> DialogExt for AppHandle<R> {
    fn dialog(&self) -> &Dialog {
        &Dialog
    }
}

pub struct Dialog;
impl Dialog {
    pub fn file(&self) -> FileDialogBuilder {
        FileDialogBuilder(Asked::default())
    }
}

pub struct FileDialogBuilder(Asked);
impl FileDialogBuilder {
    pub fn set_file_name(mut self, name: impl Into<String>) -> Self {
        self.0.file_name = name.into();
        self
    }
    pub fn add_filter(mut self, name: impl Into<String>, extensions: &[&str]) -> Self {
        self.0.filter = name.into();
        self.0.extensions = extensions
            .iter()
            .map(|&extension| extension.into())
            .collect();
        self
    }
    pub fn blocking_save_file(self) -> Option<FilePath> {
        FIXTURE.with(|state| {
            let mut state = state.borrow_mut();
            state.asked.push(self.0);
            state.answer.take()
        })
    }
}
