//! Test double for the opener plugin's functions. Unit tests never launch a file
//! manager or browser: each request is recorded, and fails when the fixture says so.
use std::{cell::RefCell, path::Path};

#[derive(Default)]
pub struct Fixture {
    /// Every request fails.
    pub failing: bool,
    /// The requests made, in order.
    pub opened: Vec<String>,
}
thread_local! { static FIXTURE: RefCell<Fixture> = RefCell::default(); }
pub fn install(fixture: Fixture) {
    FIXTURE.with(|state| *state.borrow_mut() = fixture);
}
pub fn inspect<T>(inspect: impl FnOnce(&Fixture) -> T) -> T {
    FIXTURE.with(|state| inspect(&state.borrow()))
}
fn launch(request: String) -> Result<(), ()> {
    FIXTURE.with(|state| {
        let mut state = state.borrow_mut();
        state.opened.push(request);
        if state.failing { Err(()) } else { Ok(()) }
    })
}
pub fn reveal_item_in_dir(path: &Path) -> Result<(), ()> {
    launch(format!("reveal {}", path.display()))
}
pub fn open_path(path: &Path, _with: Option<&str>) -> Result<(), ()> {
    launch(format!("open {}", path.display()))
}
pub fn open_url(url: &str, _with: Option<&str>) -> Result<(), ()> {
    launch(format!("browse {url}"))
}
