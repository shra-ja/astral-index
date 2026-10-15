//! The About dialog's commands: the app's details, and opening the data folder or
//! the issues page ([decision 0024](../../../docs/architecture/decisions/0024-about-opening.md)).
//! The opening commands take no arguments, so the webview can open nothing else.
#[cfg(test)]
use super::tests::launcher;
use super::{Failure, database::FILE_NAME};
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use serde::Serialize;
#[cfg(not(test))]
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime, State};
#[cfg(not(test))]
use tauri_plugin_opener as launcher;

/// The repository's issues page, the only address the app opens.
pub const ISSUES: &str = "https://github.com/shra-ja/astral-index/issues";
/// The file in which the mock debug binary records what it would have opened.
pub const RECORD: &str = "opened.txt";

/// How requests to open are carried out.
pub enum Opener {
    /// By the system's file manager and default browser.
    System,
    /// Recorded in the data folder's `opened.txt`, for the mock debug binary, which
    /// never launches anything
    /// ([decision 0014](../../../docs/architecture/decisions/0014-mock-debug-binary.md)).
    Recording,
}

/// The data folder in use, and how requests to open are carried out.
pub struct About {
    pub folder: Option<PathBuf>,
    pub portable: bool,
    pub opener: Opener,
}

/// What the About dialog shows. The data folder is the user's own, shown so they
/// can find and back up their history.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    version: String,
    build: Build,
    folder: Option<String>,
    portable: bool,
}

/// Which build this is, so a report can name it exactly
/// ([decision 0030](../../../docs/architecture/decisions/0030-tag-versioned-releases.md)).
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Build {
    /// A release, built by the release workflow.
    Release,
    /// A CI build of a commit, shortened as git shows it.
    Dev { commit: String },
    /// Built anywhere else; its version means nothing.
    Local,
}

/// The build from `ASTRAL_INDEX_BUILD` at compile time: `release`, or a commit's
/// lowercase hex ID from CI. Anything else is a local build.
fn build(value: Option<&str>) -> Build {
    match value {
        Some("release") => Build::Release,
        Some(commit)
            if commit.len() >= 7
                && commit
                    .bytes()
                    .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')) =>
        {
            Build::Dev {
                commit: commit[..7].to_owned(),
            }
        }
        _ => Build::Local,
    }
}

fn info(version: String, build: Build, about: &About) -> AppInfo {
    AppInfo {
        version,
        build,
        folder: about
            .folder
            .as_ref()
            .map(|folder| folder.to_string_lossy().into_owned()),
        portable: about.portable,
    }
}

/// Something to open.
#[derive(Debug, PartialEq, Eq)]
enum Target {
    /// A file, shown selected in its folder.
    Reveal(PathBuf),
    /// A folder, opened.
    Folder(PathBuf),
    /// The issues page, in the default browser.
    Issues,
}

/// The database file selected in its folder, or the folder itself when the file
/// does not exist yet.
fn data_target(folder: Option<&Path>) -> Option<Target> {
    let folder = folder?;
    let file = folder.join(FILE_NAME);
    Some(
        if fs::metadata(&file).is_ok_and(|metadata| metadata.is_file()) {
            Target::Reveal(file)
        } else {
            Target::Folder(folder.to_owned())
        },
    )
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
fn open(opener: &Opener, folder: Option<&Path>, target: Target) -> Result<(), Failure> {
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

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>, about: State<'_, About>) -> AppInfo {
    info(
        app.package_info().version.to_string(),
        build(option_env!("ASTRAL_INDEX_BUILD")),
        &about,
    )
}

/// Show the data folder, or fail without a folder to show.
fn reveal(about: &About) -> Result<(), Failure> {
    let folder = about.folder.as_deref();
    let target = data_target(folder).ok_or(Failure::OpenFailed)?;
    open(&about.opener, folder, target)
}

#[tauri::command]
pub async fn reveal_data_folder(about: State<'_, About>) -> Result<(), Failure> {
    reveal(&about)
}

#[tauri::command]
pub async fn open_issues_page(about: State<'_, About>) -> Result<(), Failure> {
    open(&about.opener, about.folder.as_deref(), Target::Issues)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture};
    use launcher::Fixture as Launches;

    fn folder() -> PathBuf {
        PathBuf::from("/local/astral-index")
    }
    fn about(folder: Option<PathBuf>, portable: bool) -> About {
        About {
            folder,
            portable,
            opener: Opener::System,
        }
    }
    fn opened() -> Vec<String> {
        launcher::inspect(|state| state.opened.clone())
    }

    #[test]
    fn app_info_gives_the_version_build_folder_and_mode() {
        let shown = info("1.2.0".into(), Build::Release, &about(Some(folder()), true));
        assert_eq!(
            serde_json::to_value(shown).unwrap(),
            serde_json::json!({
                "version": "1.2.0",
                "build": { "kind": "release" },
                "folder": "/local/astral-index",
                "portable": true,
            })
        );
        // Without a folder from the platform, there is none to show.
        let shown = info("1.2.0".into(), Build::Local, &about(None, false));
        assert_eq!(shown.folder, None);
        assert!(!shown.portable);
    }

    #[test]
    fn the_build_is_a_release_a_ci_commit_or_local() {
        // CI sets ASTRAL_INDEX_BUILD at compile time (decision 0030).
        assert_eq!(build(Some("release")), Build::Release);
        let commit = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
        assert_eq!(
            build(Some(commit)),
            Build::Dev {
                commit: "a1b2c3d".into()
            }
        );
        assert_eq!(
            build(Some("a1b2c3d")),
            Build::Dev {
                commit: "a1b2c3d".into()
            }
        );
        // Anything else, or nothing, is a local build: never a commit it can't be.
        for value in [
            None,
            Some(""),
            Some("a1b2c3"),
            Some("not-a-commit"),
            Some("A1B2C3D"),
        ] {
            assert_eq!(build(value), Build::Local, "{value:?}");
        }
        assert_eq!(
            serde_json::to_value(Build::Dev {
                commit: "a1b2c3d".into()
            })
            .unwrap(),
            serde_json::json!({ "kind": "dev", "commit": "a1b2c3d" })
        );
        assert_eq!(
            serde_json::to_value(Build::Local).unwrap(),
            serde_json::json!({ "kind": "local" })
        );
    }

    #[test]
    fn the_data_target_is_the_database_file_once_it_exists() {
        let file = folder().join(FILE_NAME);
        filesystem::install(Fixture {
            files: [(file.clone(), vec![])].into(),
            ..Default::default()
        });
        assert_eq!(
            data_target(Some(&folder())),
            Some(Target::Reveal(file.clone()))
        );
        // Before the first save, or if the name is taken by a folder, the folder opens.
        filesystem::install(Fixture::default());
        assert_eq!(data_target(Some(&folder())), Some(Target::Folder(folder())));
        filesystem::install(Fixture {
            directories: vec![file],
            ..Default::default()
        });
        assert_eq!(data_target(Some(&folder())), Some(Target::Folder(folder())));
        // Without a folder there is nothing to open.
        assert_eq!(data_target(None), None);
    }

    #[test]
    fn revealing_opens_the_data_folder_or_fails_without_one() {
        launcher::install(Launches::default());
        filesystem::install(Fixture::default());
        assert_eq!(reveal(&about(Some(folder()), false)), Ok(()));
        assert_eq!(opened(), ["open /local/astral-index"]);
        // The platform gave no folder: nothing is opened.
        launcher::install(Launches::default());
        assert_eq!(reveal(&about(None, false)), Err(Failure::OpenFailed));
        assert!(opened().is_empty());
    }

    #[test]
    fn the_system_opener_hands_each_target_to_the_plugin() {
        launcher::install(Launches::default());
        let file = folder().join(FILE_NAME);
        assert_eq!(open(&Opener::System, None, Target::Reveal(file)), Ok(()));
        assert_eq!(
            open(&Opener::System, None, Target::Folder(folder())),
            Ok(())
        );
        assert_eq!(open(&Opener::System, None, Target::Issues), Ok(()));
        assert_eq!(
            opened(),
            [
                format!("reveal {}", folder().join(FILE_NAME).display()).as_str(),
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
