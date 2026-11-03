//! A history file's Star Rail accounts as an import sees them: the server each one
//! goes into, or why it can't be imported
//! ([decision 0032](../../docs/architecture/decisions/0032-history-file-import-rules.md)).
//! No file, database or network access: the saved accounts are passed in.

use crate::hsr::{self, Batch};
use crate::storage::SavedAccount;
use crate::uigf::{self, Problem, RecordFaults};
use serde::Serialize;

/// A history file's Star Rail accounts, and what was left out of it.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct FileContents {
    accounts: Vec<FileAccount>,
    /// Star Rail accounts whose UID is not digits, which are not shown.
    malformed_uids: usize,
    /// Other games' sections, which are not read.
    other_games: Vec<&'static str>,
}

/// One Star Rail account in a history file. Holds a player identifier: never log it.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct FileAccount {
    uid: String,
    #[serde(flatten)]
    status: Status,
}

/// Whether an account can be imported: into which server, or why not.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Status {
    /// It can be previewed: the server it goes into and how many rolls it holds.
    Importable {
        server: String,
        rolls: usize,
    },
    /// The file holds the UID more than once.
    Repeated,
    /// The file's time zone is not a real UTC offset.
    InvalidTimezone,
    NoRolls,
    /// Some records lack fields or have invalid values.
    Records(RecordFaults),
    /// The UID is not saved and the game's rule gives it no server.
    NoServer,
    /// The UID is saved on more than one server, so which is meant is unknown.
    SeveralServers,
    /// The file's time zone differs from the server's offset, or the saved
    /// account's.
    TimezoneMismatch,
}
impl From<Problem> for Status {
    fn from(problem: Problem) -> Self {
        match problem {
            Problem::Repeated => Self::Repeated,
            Problem::InvalidTimezone => Self::InvalidTimezone,
            Problem::NoRolls => Self::NoRolls,
            Problem::Records(faults) => Self::Records(faults),
        }
    }
}

/// The server an account of the file goes into: the one it is saved on, as a UID
/// belongs to one server, or else the one the game's rule gives it. Its time zone
/// must be that server's offset, or the saved account's.
fn server_for(uid: &str, timezone: i32, saved: &[SavedAccount]) -> Result<String, Status> {
    let servers: Vec<&SavedAccount> = saved.iter().filter(|account| account.uid == uid).collect();
    match servers[..] {
        [] => {
            let server = hsr::server_of(uid).map_err(|_| Status::NoServer)?;
            (server.offset == timezone)
                .then(|| server.name.to_owned())
                .ok_or(Status::TimezoneMismatch)
        }
        [account] => (account.timezone == Some(timezone))
            .then(|| account.server.clone())
            .ok_or(Status::TimezoneMismatch),
        _ => Err(Status::SeveralServers),
    }
}

/// Each account's status, and the batches of those that can be imported.
pub fn resolve(file: uigf::File, saved: &[SavedAccount]) -> (FileContents, Vec<Batch>) {
    let mut batches = Vec::new();
    let accounts = file
        .accounts
        .into_iter()
        .map(|account| {
            let status = match account.history {
                Err(problem) => problem.into(),
                Ok(history) => match server_for(&account.uid, history.timezone, saved) {
                    Err(status) => status,
                    Ok(server) => {
                        let status = Status::Importable {
                            server: server.clone(),
                            rolls: history.rolls.len(),
                        };
                        batches.push(Batch {
                            uid: account.uid.clone(),
                            server,
                            timezone: Some(history.timezone),
                            rolls: history.rolls,
                        });
                        status
                    }
                },
            };
            FileAccount {
                uid: account.uid,
                status,
            }
        })
        .collect();
    let contents = FileContents {
        accounts,
        malformed_uids: file.malformed_uids,
        other_games: file.other_games,
    };
    (contents, batches)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// A Star Rail roll of the UIGF shape.
    pub(crate) fn record(id: &str) -> Value {
        json!({
            "gacha_id": "2003", "gacha_type": "11", "item_id": "1001",
            "time": "2026-01-01 12:00:00", "name": "Synthetic Character",
            "item_type": "Character", "rank_type": "5", "id": id,
        })
    }
    pub(crate) fn account(uid: &str, timezone: i32, list: &[Value]) -> Value {
        json!({ "uid": uid, "timezone": timezone, "list": list })
    }
    /// A UIGF v4.2 file of these Star Rail accounts.
    pub(crate) fn file(accounts: &[Value]) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "info": {
                "export_timestamp": 0, "export_app": "Synthetic Exporter",
                "export_app_version": "0.0.0", "version": "v4.2",
            },
            "hkrpg": accounts,
        }))
        .unwrap()
    }
    /// The history file chosen, holding `bytes`, and the database it is read beside.
    fn saved(uid: &str, server: &str, timezone: Option<i32>) -> SavedAccount {
        SavedAccount {
            uid: uid.into(),
            server: server.into(),
            timezone,
            rolls: 1,
        }
    }

    #[test]
    fn an_account_goes_into_its_saved_server_or_the_rule_s_and_its_offset_must_match() {
        let status = |uid: &str, timezone: i32, saved: &[SavedAccount]| {
            let file = uigf::read(&file(&[account(uid, timezone, &[record("1")])])).unwrap();
            let (mut contents, _) = resolve(file, saved);
            contents.accounts.remove(0).status
        };
        let importable = |server: &str| Status::Importable {
            server: server.into(),
            rolls: 1,
        };
        // A saved UID keeps the server it is saved on, whatever the rule says.
        let synthetic = [saved("800000001", "synthetic-server", Some(8))];
        assert_eq!(
            status("800000001", 8, &synthetic),
            importable("synthetic-server")
        );
        assert_eq!(status("800000001", 9, &synthetic), Status::TimezoneMismatch);
        let unknown = [saved("800000001", "synthetic-server", None)];
        assert_eq!(status("800000001", 8, &unknown), Status::TimezoneMismatch);
        let both = [
            saved("800000001", "prod_official_asia", Some(8)),
            saved("800000001", "synthetic-server", Some(8)),
        ];
        assert_eq!(status("800000001", 8, &both), Status::SeveralServers);
        // Another saved account changes nothing.
        let other = [saved("800000002", "prod_official_asia", Some(8))];
        assert_eq!(
            status("700000001", 1, &other),
            importable("prod_official_eur")
        );
        assert_eq!(status("700000001", 8, &other), Status::TimezoneMismatch);
        assert_eq!(status("300000001", 8, &other), Status::NoServer);
        assert_eq!(status("70000001", 1, &other), Status::NoServer);
    }

    #[test]
    fn the_reader_s_reasons_cross_ipc_as_kinds_with_their_counts() {
        let status = |problem: Problem| serde_json::to_value(Status::from(problem)).unwrap();
        assert_eq!(status(Problem::Repeated), json!({ "kind": "repeated" }));
        assert_eq!(
            status(Problem::InvalidTimezone),
            json!({ "kind": "invalid_timezone" })
        );
        assert_eq!(status(Problem::NoRolls), json!({ "kind": "no_rolls" }));
        let faults = RecordFaults {
            missing: [("name", 2)].into(),
            invalid: 1,
            newer_categories: 3,
        };
        assert_eq!(
            status(Problem::Records(faults)),
            json!({ "kind": "records", "missing": { "name": 2 }, "invalid": 1, "newer_categories": 3 })
        );
        for (status, kind) in [
            (Status::NoServer, "no_server"),
            (Status::SeveralServers, "several_servers"),
            (Status::TimezoneMismatch, "timezone_mismatch"),
        ] {
            assert_eq!(
                serde_json::to_value(status).unwrap(),
                json!({ "kind": kind })
            );
        }
    }
}
