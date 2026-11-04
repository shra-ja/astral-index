//! The Import screen's history file: read and checked natively once chosen, then
//! one of its Star Rail accounts previewed for saving, as retrieval's history is.
//! Only the accounts' UIDs, servers and statuses, and the review, cross IPC; the
//! file's path and contents stay here. Nothing is requested from HoYoverse.
use super::{Failure, Session, chosen_file::HistoryFile, database::Database};
use crate::file_import::{FileContents, resolve};
use crate::selected_file::{self, FileError};
use crate::storage::{Review, Source};
use crate::uigf::{self, MAX_FILE_BYTES};
use std::path::Path;
use tauri::State;

impl From<uigf::Error> for Failure {
    fn from(error: uigf::Error) -> Self {
        match error {
            uigf::Error::TooLarge => Self::FileTooLarge,
            uigf::Error::NotJson | uigf::Error::NotUigf => Self::NotHistoryFile,
            uigf::Error::Unsupported(found) => Self::UnsupportedFile(found),
        }
    }
}

/// Read the chosen file within its bound and check it as UIGF.
fn read_file(path: &Path) -> Result<uigf::File, Failure> {
    let bytes = selected_file::read(path, MAX_FILE_BYTES).map_err(|error| match error {
        FileError::TooLarge => Failure::FileTooLarge,
        FileError::Unreadable | FileError::NotRegularFile => Failure::InvalidFile,
    })?;
    Ok(uigf::read(&bytes)?)
}

/// Read the held file, list its accounts and hold the ones that can be imported
/// until one is previewed, unless the read was cancelled or another import began
/// meanwhile. Any earlier import is stopped first. The bounded read and its check
/// run on the async worker running this command, as the cache file's do.
async fn read_into(
    session: &Session,
    database: &Database,
    held: &HistoryFile,
) -> Result<FileContents, Failure> {
    let token = session.begin();
    let _running = session.running();
    let path = held.take().ok_or(Failure::InvalidFile)?;
    let file = read_file(&path)?;
    let saved = database
        .run(|store| store.accounts())
        .await
        .and_then(|accounts| accounts)
        .map_err(Failure::from)?;
    let (contents, batches) = resolve(file, &saved);
    session.keep_file(&token, batches).map(|()| contents)
}

/// Preview the held file's account `uid` and hold the preview for commit or
/// discard, unless another import began meanwhile. The file is used up: another
/// of its accounts means reading it again.
async fn preview_into(
    session: &Session,
    database: &Database,
    uid: &str,
) -> Result<Review, Failure> {
    let _running = session.running();
    let batch = session
        .take_file()
        .and_then(|batches| batches.into_iter().find(|batch| batch.uid == uid))
        .ok_or(Failure::InvalidRequest)?;
    let token = session.begin();
    let preview = database
        .run(move |store| store.preview(Source::Uigf, batch))
        .await
        .and_then(|preview| preview)
        .map_err(Failure::from)?;
    let review = preview.review().clone();
    session.keep_preview(&token, preview).map(|()| review)
}

/// Reads the history file `choose_history_file` holds and lists its Star Rail
/// accounts. Stored history and the chosen file only: never contacts HoYoverse.
#[tauri::command]
pub async fn read_history_file(
    session: State<'_, Session>,
    database: State<'_, Database>,
    history: State<'_, HistoryFile>,
) -> Result<FileContents, Failure> {
    read_into(&session, &database, &history).await
}

/// Previews one account of the history file read last, for `commit_import` or
/// `discard_import`. Never contacts HoYoverse.
#[tauri::command]
pub async fn preview_file_account(
    session: State<'_, Session>,
    database: State<'_, Database>,
    uid: String,
) -> Result<Review, Failure> {
    preview_into(&session, &database, &uid).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture as Files};
    use crate::file_import::tests::{account, file, record};
    use crate::hsr::Batch;
    use crate::storage::tests::database::{self as sql, Step};
    use crate::storage::tests::{accounts_row, accounts_script, failing_at, preview_script};
    use crate::uigf::Found;
    use serde_json::{Value, json};
    use std::path::PathBuf;

    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    fn path() -> PathBuf {
        PathBuf::from("/exports/history.json")
    }
    /// The history file chosen, holding `bytes`, and the database it is read beside.
    fn chosen(bytes: Vec<u8>) -> (HistoryFile, Database) {
        filesystem::install(Files {
            files: [(path(), bytes)].into(),
            ..Default::default()
        });
        let held = HistoryFile::default();
        held.hold(path());
        (held, Database::new(Some(PathBuf::from("/data"))))
    }
    /// Opening the history and reading its accounts, answered with `saved`.
    fn accounts_read(saved: Vec<Vec<rusqlite::types::Value>>) -> Vec<Step> {
        let mut steps = super::super::tests::opening();
        steps.extend(accounts_script(saved));
        steps
    }
    /// The fixture page's account, as a file would give it.
    fn page_batch() -> Batch {
        let rolls = crate::parse_response(include_bytes!("../../tests/fixtures/hsr-api/page.json"))
            .unwrap()
            .list;
        Batch {
            uid: "100000002".into(),
            server: "synthetic-server".into(),
            timezone: Some(8),
            rolls,
        }
    }

    #[test]
    fn a_file_s_accounts_are_listed_and_the_importable_ones_held() {
        let session = Session::default();
        let (held, database) = chosen(file(&[
            // Saved on the fixture's server, so it goes there.
            account("100000002", 8, &[record("1")]),
            // Not saved, so the rule gives its server.
            account("800000001", 8, &[record("2"), record("3")]),
            account("800000002", 8, &[]),
            json!({ "uid": "8000 0001", "timezone": 8, "list": [] }),
        ]));
        sql::expect(accounts_read(vec![accounts_row()]));
        let contents = run(read_into(&session, &database, &held)).unwrap();
        sql::finish();
        assert_eq!(
            serde_json::to_value(&contents).unwrap(),
            json!({
                "accounts": [
                    { "uid": "100000002", "kind": "importable", "server": "synthetic-server", "rolls": 1 },
                    { "uid": "800000001", "kind": "importable", "server": "prod_official_asia", "rolls": 2 },
                    { "uid": "800000002", "kind": "no_rolls" },
                ],
                "malformed_uids": 1,
                "other_games": [],
            })
        );
        // The path is used up, and the importable accounts held until one is
        // previewed, as an import awaiting the user.
        assert_eq!(held.take(), None);
        assert!(session.importing());
        let batches = session.take_file().unwrap();
        let held: Vec<_> = batches
            .iter()
            .map(|batch| {
                (
                    batch.uid.as_str(),
                    batch.server.as_str(),
                    batch.timezone,
                    batch.rolls.len(),
                )
            })
            .collect();
        assert_eq!(
            held,
            [
                ("100000002", "synthetic-server", Some(8), 1),
                ("800000001", "prod_official_asia", Some(8), 2),
            ]
        );
    }

    #[test]
    fn a_file_that_cannot_be_read_says_why_and_leaves_nothing_held() {
        let failed = |bytes: Vec<u8>| {
            let session = Session::default();
            let (held, database) = chosen(bytes);
            let failure = run(read_into(&session, &database, &held)).unwrap_err();
            assert!(!session.importing());
            assert_eq!(held.take(), None);
            failure
        };
        let mut large = file(&[]);
        large.resize(MAX_FILE_BYTES + 1, b' ');
        assert_eq!(failed(large), Failure::FileTooLarge);
        // The bounded read refuses a large file first; the reader's own refusal
        // of more bytes than it takes says the same.
        assert_eq!(Failure::from(uigf::Error::TooLarge), Failure::FileTooLarge);
        assert_eq!(failed(b"{".to_vec()), Failure::NotHistoryFile);
        assert_eq!(failed(b"[]".to_vec()), Failure::NotHistoryFile);
        let legacy = br#"{"info":{"uigf_version":"v3.0"},"list":[]}"#.to_vec();
        let failure = failed(legacy);
        assert_eq!(failure, Failure::UnsupportedFile(Found::LegacyUigf));
        assert_eq!(
            serde_json::to_value(failure).unwrap(),
            json!({ "kind": "unsupported_file", "code": { "format": "legacy_uigf" } })
        );
        let mut newer: Value = serde_json::from_slice(&file(&[])).unwrap();
        newer["info"]["version"] = json!("v5.0");
        assert_eq!(
            serde_json::to_value(failed(serde_json::to_vec(&newer).unwrap())).unwrap(),
            json!({ "kind": "unsupported_file", "code": { "format": "uigf", "major": 5, "minor": 0 } })
        );
        // Nothing chosen, or a file that has gone.
        let session = Session::default();
        let database = Database::new(Some(PathBuf::from("/data")));
        filesystem::install(Files::default());
        let none = HistoryFile::default();
        assert_eq!(
            run(read_into(&session, &database, &none)),
            Err(Failure::InvalidFile)
        );
        none.hold(path());
        assert_eq!(
            run(read_into(&session, &database, &none)),
            Err(Failure::InvalidFile)
        );
        // A file that fails while it is read.
        filesystem::install(Files {
            files: [(path(), file(&[]))].into(),
            read_failure: true,
            ..Default::default()
        });
        none.hold(path());
        assert_eq!(
            run(read_into(&session, &database, &none)),
            Err(Failure::InvalidFile)
        );
        // Saved history that can't be read.
        let (held, database) = chosen(file(&[account("800000001", 8, &[record("1")])]));
        sql::expect(accounts_read(vec![vec![rusqlite::types::Value::Null]]));
        assert_eq!(
            run(read_into(&session, &database, &held)),
            Err(Failure::Storage)
        );
        sql::finish();
        assert!(!session.importing());
    }

    #[test]
    fn a_file_read_cancelled_or_overtaken_holds_nothing() {
        let session = Session::default();
        // Cancelled, or another import began, before its accounts were held.
        let token = session.begin();
        session.cancel();
        assert_eq!(
            session.keep_file(&token, vec![page_batch()]),
            Err(Failure::Cancelled)
        );
        let token = session.begin();
        session.begin();
        assert_eq!(
            session.keep_file(&token, vec![page_batch()]),
            Err(Failure::Cancelled)
        );
        assert!(!session.importing());
        // A file with nothing to import holds nothing either.
        assert_eq!(session.keep_file(&session.begin(), Vec::new()), Ok(()));
        assert!(!session.importing());
    }

    #[test]
    fn previewing_an_account_uses_the_file_up_and_holds_the_review() {
        let session = Session::default();
        let database = Database::new(Some(PathBuf::from("/data")));
        filesystem::install(Files::default());
        session
            .keep_file(&session.begin(), vec![page_batch()])
            .unwrap();
        let mut script = super::super::tests::opening();
        script.extend(preview_script());
        sql::expect(script);
        let review = run(preview_into(&session, &database, "100000002")).unwrap();
        sql::finish();
        assert_eq!(serde_json::to_value(review).unwrap()["uid"], "100000002");
        // The review is held for saving or discarding, and the file is used up.
        assert!(session.importing());
        assert!(session.take_file().is_none());
        assert!(session.take_preview().is_ok());
        assert_eq!(
            run(preview_into(&session, &database, "100000002")).err(),
            Some(Failure::InvalidRequest)
        );
        // An account the file didn't offer uses the file up too.
        session
            .keep_file(&session.begin(), vec![page_batch()])
            .unwrap();
        assert_eq!(
            run(preview_into(&session, &database, "800000001")).err(),
            Some(Failure::InvalidRequest)
        );
        assert!(!session.importing());
        // A failed preview holds nothing.
        session
            .keep_file(&session.begin(), vec![page_batch()])
            .unwrap();
        let after_begin = preview_script()[1].sql.clone();
        sql::expect(failing_at(preview_script(), &after_begin));
        assert_eq!(
            run(preview_into(&session, &database, "100000002")).err(),
            Some(Failure::Storage)
        );
        sql::finish();
        assert!(!session.importing());
    }
}
