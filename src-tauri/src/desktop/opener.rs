//! Opening a file, a folder or a fixed web page in the system's file manager or
//! browser, or recording the request for the mock debug binary
//! ([decision 0024](../../../docs/architecture/decisions/0024-about-opening.md)).
//! Commands choose a target; the webview never names one.
use super::Failure;
#[cfg(test)]
use super::tests::launcher;
#[cfg(test)]
use crate::tests::filesystem as fs;
#[cfg(not(test))]
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use tauri_plugin_opener as launcher;

/// The repository's issues page, a fixed address the app opens.
const ISSUES: &str = "https://github.com/shra-ja/astral-index/issues";
/// The file in which the mock debug binary records what it would have opened.
const RECORD: &str = "opened.txt";

/// How requests to open are carried out, held for every command that opens something.
/// Public, as the commands take it as state.
pub enum Opener {
    /// By the system's file manager and default browser.
    System,
    /// Recorded in the data folder's `opened.txt`, for the mock debug binary, which
    /// never launches anything
    /// ([decision 0014](../../../docs/architecture/decisions/0014-mock-debug-binary.md)).
    Recording,
}

/// Something to open.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Target {
    /// A file, shown selected in its folder.
    Reveal(PathBuf),
    /// A folder, opened.
    Folder(PathBuf),
    /// The issues page, in the default browser.
    Issues,
}

/// A line naming the request, as the mock debug binary records it.
fn request(target: &Target) -> String {
    match target {
        Target::Reveal(file) => format!("reveal {}", file.display()),
        Target::Folder(folder) => format!("open {}", folder.display()),
        Target::Issues => format!("browse {ISSUES}"),
    }
}

/// Open `target`, or record it in `folder` for the mock debug binary. A failure
/// names neither the target nor the reason.
pub(super) fn open(opener: &Opener, folder: Option<&Path>, target: Target) -> Result<(), Failure> {
    let opened = match opener {
        Opener::System => match &target {
            Target::Reveal(file) => launcher::reveal_item_in_dir(file).is_ok(),
            Target::Folder(folder) => launcher::open_path(folder, None::<&str>).is_ok(),
            Target::Issues => launcher::open_url(ISSUES, None::<&str>).is_ok(),
        },
        Opener::Recording => folder.is_some_and(|folder| {
            fs::write(folder.join(RECORD), format!("{}\n", request(&target))).is_ok()
        }),
    };
    opened.then_some(()).ok_or(Failure::OpenFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::filesystem::{self, Fixture};
    use launcher::{Fixture as Launches, opened};

    fn folder() -> PathBuf {
        PathBuf::from("/local/astral-index")
    }

    #[test]
    fn the_system_opener_hands_each_target_to_the_plugin() {
        launcher::install(Launches::default());
        let file = folder().join("history.sqlite");
        assert_eq!(open(&Opener::System, None, Target::Reveal(file)), Ok(()));
        assert_eq!(
            open(&Opener::System, None, Target::Folder(folder())),
            Ok(())
        );
        assert_eq!(open(&Opener::System, None, Target::Issues), Ok(()));
        assert_eq!(
            opened(),
            [
                format!("reveal {}", folder().join("history.sqlite").display()).as_str(),
                "open /local/astral-index",
                "browse https://github.com/shra-ja/astral-index/issues",
            ]
        );
    }

    #[test]
    fn a_failed_opening_is_reported_without_the_target() {
        launcher::install(Launches {
            failing: true,
            ..Default::default()
        });
        for target in [
            Target::Reveal(folder()),
            Target::Folder(folder()),
            Target::Issues,
        ] {
            assert_eq!(
                open(&Opener::System, None, target),
                Err(Failure::OpenFailed)
            );
        }
        assert_eq!(
            serde_json::to_value(Failure::OpenFailed).unwrap(),
            serde_json::json!({ "kind": "open_failed" })
        );
    }

    #[test]
    fn the_recording_opener_writes_the_request_and_launches_nothing() {
        launcher::install(Launches::default());
        filesystem::install(Fixture::default());
        let record = folder().join(RECORD);
        let folder = Some(folder());
        assert_eq!(
            open(&Opener::Recording, folder.as_deref(), Target::Issues),
            Ok(())
        );
        let written = |path: &Path| filesystem::inspect(|state| state.files.get(path).cloned());
        assert_eq!(
            written(&record).as_deref(),
            Some(&b"browse https://github.com/shra-ja/astral-index/issues\n"[..])
        );
        // Each request replaces the last.
        let target = Target::Reveal(PathBuf::from("/local/astral-index/history.sqlite"));
        assert_eq!(open(&Opener::Recording, folder.as_deref(), target), Ok(()));
        assert_eq!(
            written(&record).as_deref(),
            Some(&b"reveal /local/astral-index/history.sqlite\n"[..])
        );
        let target = Target::Folder(PathBuf::from("/local/astral-index"));
        assert_eq!(open(&Opener::Recording, folder.as_deref(), target), Ok(()));
        assert_eq!(
            written(&record).as_deref(),
            Some(&b"open /local/astral-index\n"[..])
        );
        assert!(opened().is_empty());
    }

    #[test]
    fn the_recording_opener_fails_when_it_cannot_record() {
        // A folder in the record's place, as the end-to-end tests arrange.
        filesystem::install(Fixture {
            directories: vec![folder().join(RECORD)],
            ..Default::default()
        });
        assert_eq!(
            open(&Opener::Recording, Some(&folder()), Target::Issues),
            Err(Failure::OpenFailed)
        );
        // Without a data folder there is nowhere to record.
        assert_eq!(
            open(&Opener::Recording, None, Target::Issues),
            Err(Failure::OpenFailed)
        );
    }
}
