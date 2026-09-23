//! Local SQLite storage and immutable import previews. No acquisition or UI access.
use crate::{Page, ParseError, Roll, parse_response};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use std::{collections::BTreeMap, path::Path};

const GAME: &str = "honkai-star-rail";
const APPLICATION_ID: i32 = 1381257795;
const MAX_BATCH_BYTES: usize = 16 * 1024 * 1024;

/// Safe categories only: SQLite, JSON and source messages never cross the boundary.
#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    Database,
    Schema,
    Context,
    Empty,
    TooLarge,
    Parse(ParseError),
    Conflict,
    StalePreview,
    InvalidStoredData,
}
impl From<rusqlite::Error> for Error {
    fn from(_: rusqlite::Error) -> Self {
        Self::Database
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::InvalidStoredData
    }
}
impl From<ParseError> for Error {
    fn from(error: ParseError) -> Self {
        Self::Parse(error)
    }
}

#[derive(Debug, Default, PartialEq, Eq, Clone, Copy)]
pub struct Summary {
    pub inserted: usize,
    pub duplicates: usize,
    pub conflicts: usize,
}

/// Owns validated input. Callers cannot replace records or alter reviewed counts.
pub struct Preview {
    summary: Summary,
    uid: String,
    server: String,
    timezone: Option<i32>,
    records: Vec<(String, String)>,
    pages: String,
    snapshot: (String, i64),
}
impl Preview {
    pub fn summary(&self) -> Summary {
        self.summary
    }
}

pub struct Store {
    connection: Connection,
}
impl Store {
    /// Only the native caller selects a database path; never expose this as a UI command.
    pub fn open(path: &Path) -> Result<Self, Error> {
        Self::initialize(Connection::open(path)?)
    }

    fn initialize(mut connection: Connection) -> Result<Self, Error> {
        connection.execute_batch("PRAGMA busy_timeout=250; PRAGMA foreign_keys=ON;")?;
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version: i32 = tx.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let app: i32 = tx.query_row("PRAGMA application_id", [], |row| row.get(0))?;
        if (version, app) == (0, 0) {
            let objects: i64 = tx.query_row(
                "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )?;
            if objects != 0 {
                return Err(Error::Schema);
            }
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))?;
        } else if (version, app) != (1, APPLICATION_ID) {
            return Err(Error::Schema);
        }
        snapshot(&tx)?;
        tx.commit()?;
        Ok(Self { connection })
    }

    /// Preview all pages atomically; ambiguous or mismatched context blocks the batch.
    pub fn preview(&mut self, uid: &str, server: &str, bytes: &[&[u8]]) -> Result<Preview, Error> {
        if !crate::digits(uid) || server.trim().is_empty() {
            return Err(Error::Context);
        }
        if bytes
            .iter()
            .fold(0usize, |size, page| size.saturating_add(page.len()))
            > MAX_BATCH_BYTES
        {
            return Err(Error::TooLarge);
        }
        let mut pages: Vec<Page> = Vec::new();
        let mut records = Vec::new();
        for bytes in bytes {
            let page = parse_response(bytes)?;
            if page
                .region
                .as_deref()
                .is_some_and(|region| region != server)
            {
                return Err(Error::Context);
            }
            if pages
                .first()
                .is_some_and(|first| first.region_time_zone != page.region_time_zone)
            {
                return Err(Error::Context);
            }
            for roll in &page.list {
                if roll.uid != uid {
                    return Err(Error::Context);
                }
                records.push((roll.id.clone(), serde_json::json!(roll).to_string()));
            }
            pages.push(page);
        }
        if records.is_empty() {
            return Err(Error::Empty);
        }
        let timezone = pages[0].region_time_zone;
        let tx = self.connection.transaction()?;
        check_timezone(&tx, uid, server, timezone)?;
        let summary = classify(&tx, uid, server, &records)?;
        let preview = Preview {
            summary,
            uid: uid.to_owned(),
            server: server.to_owned(),
            timezone,
            records,
            pages: serde_json::json!(pages).to_string(),
            snapshot: snapshot(&tx)?,
        };
        tx.commit()?;
        Ok(preview)
    }

    /// Commit the exact reviewed input, or leave all durable state unchanged.
    pub fn commit(&mut self, preview: Preview, imported_at: i64) -> Result<Summary, Error> {
        if preview.summary.conflicts != 0 {
            return Err(Error::Conflict);
        }
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if snapshot(&tx)? != preview.snapshot {
            return Err(Error::StalePreview);
        }
        check_timezone(&tx, &preview.uid, &preview.server, preview.timezone)?;
        if classify(&tx, &preview.uid, &preview.server, &preview.records)? != preview.summary {
            return Err(Error::StalePreview);
        }
        tx.execute("INSERT INTO accounts(game,uid,server,timezone) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING",
            params![GAME, preview.uid, preview.server, preview.timezone])?;
        tx.execute(
            "INSERT INTO batches(game,uid,server,adapter,pages,imported_at) VALUES (?1,?2,?3,'hsr-api-v1',?4,?5)",
            params![GAME, preview.uid, preview.server, preview.pages, imported_at],
        )?;
        let batch = tx.last_insert_rowid();
        for (occurrence, (id, payload)) in preview.records.iter().enumerate() {
            tx.execute("INSERT INTO rolls(game,uid,server,id,payload) VALUES (?1,?2,?3,?4,?5) ON CONFLICT DO NOTHING",
                params![GAME, preview.uid, preview.server, id, payload])?;
            tx.execute("INSERT INTO batch_rolls(batch_id,occurrence,game,uid,server,roll_id) VALUES (?1,?2,?3,?4,?5,?6)",
                params![batch, occurrence as i64, GAME, preview.uid, preview.server, id])?;
        }
        tx.execute(
            "UPDATE metadata SET revision=revision+1 WHERE singleton=1",
            [],
        )?;
        tx.commit()?;
        Ok(preview.summary)
    }

    /// Returns a deterministic identity ordering, not an inferred chronological ordering.
    pub fn history(&self, uid: &str, server: &str) -> Result<Vec<Roll>, Error> {
        let mut statement = self.connection.prepare(
            "SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 ORDER BY id",
        )?;
        let rows =
            statement.query_map(params![GAME, uid, server], |row| row.get::<_, String>(0))?;
        let mut records = Vec::new();
        for row in rows {
            records.push(serde_json::from_str(&row?)?);
        }
        Ok(records)
    }
}

fn check_timezone(
    connection: &Connection,
    uid: &str,
    server: &str,
    timezone: Option<i32>,
) -> Result<(), Error> {
    let stored_timezone: Option<Option<i32>> = connection
        .query_row(
            "SELECT timezone FROM accounts WHERE game=?1 AND uid=?2 AND server=?3",
            params![GAME, uid, server],
            |row| row.get(0),
        )
        .optional()?;
    if stored_timezone.is_some_and(|stored| stored != timezone) {
        return Err(Error::Context);
    }
    Ok(())
}

fn snapshot(connection: &Connection) -> Result<(String, i64), Error> {
    Ok(connection.query_row(
        "SELECT database_id,revision FROM metadata WHERE singleton=1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?)
}

fn classify(
    connection: &Connection,
    uid: &str,
    server: &str,
    records: &[(String, String)],
) -> Result<Summary, Error> {
    let mut summary = Summary::default();
    let mut seen: BTreeMap<&String, String> = BTreeMap::new();
    for (id, payload) in records {
        let previous =
            if let Some(previous) = seen.get(id) {
                Some(previous.clone())
            } else {
                connection.query_row(
                "SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND id=?4",
                params![GAME, uid, server, id], |row| row.get::<_, String>(0)).optional()?
            };
        match previous {
            Some(previous) => {
                if previous == *payload {
                    summary.duplicates += 1;
                } else {
                    summary.conflicts += 1;
                }
                seen.insert(id, previous);
            }
            None => {
                summary.inserted += 1;
                seen.insert(id, payload.clone());
            }
        }
    }
    Ok(summary)
}

#[cfg(test)]
#[path = "../tests/storage/failures.rs"]
mod tests;

#[cfg(test)]
#[path = "../tests/storage/behavior.rs"]
mod integration_tests;
