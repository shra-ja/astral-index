//! Local SQLite storage and immutable import previews. No acquisition or UI access.
#[cfg(test)]
use self::tests::database::Connection;
use crate::hsr::Category;
use crate::{MAX_BATCH_BYTES, ParseError, Roll, parse_response};
#[cfg(not(test))]
use rusqlite::Connection;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
use std::{collections::BTreeMap, path::Path};

const GAME: &str = "honkai-star-rail";
const APPLICATION_ID: i32 = 1381257795;

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
    // Keep SQL details and stored values out of errors exposed to callers.
    fn from(_: rusqlite::Error) -> Self {
        Self::Database
    }
}
impl From<serde_json::Error> for Error {
    // Report unreadable stored records without leaking their contents.
    fn from(_: serde_json::Error) -> Self {
        Self::InvalidStoredData
    }
}
impl From<ParseError> for Error {
    fn from(error: ParseError) -> Self {
        Self::Parse(error)
    }
}

/// Counts let callers review an import before committing and retain a compact audit.
#[derive(Debug, Default, PartialEq, Eq, Clone, Copy, Serialize)]
pub struct Summary {
    pub inserted: usize,
    pub duplicates: usize,
    pub conflicts: usize,
}
impl Summary {
    fn count(&mut self, status: Status) {
        match status {
            Status::New => self.inserted += 1,
            Status::Duplicate => self.duplicates += 1,
            Status::Conflict => self.conflicts += 1,
        }
    }
    fn of(statuses: &[Status]) -> Self {
        let mut summary = Self::default();
        for status in statuses {
            summary.count(*status);
        }
        summary
    }
}

/// How one incoming record compares with stored and earlier incoming rolls.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Status {
    New,
    Duplicate,
    Conflict,
}

/// What an import would change, for the user to review before committing. It is
/// the webview's review data: counts, scope and conflict locations, never payloads.
/// Holds a player identifier: never log it.
#[derive(Default, Serialize)]
pub struct Review {
    uid: String,
    server: String,
    /// UTC offset in hours of the server-local times, when the responses gave one.
    timezone: Option<i32>,
    summary: Summary,
    /// Counts for each known category, in fetch order, including empty ones.
    categories: Vec<CategoryCounts>,
    /// Earliest and latest server-local record times in the import.
    earliest: String,
    latest: String,
    conflicts: Vec<Conflict>,
}
#[derive(Serialize)]
struct CategoryCounts {
    gacha_type: &'static str,
    #[serde(flatten)]
    counts: Summary,
}
/// Where an incoming record disagrees with a stored or earlier record of the same ID.
#[derive(Serialize)]
struct Conflict {
    id: String,
    gacha_type: String,
    time: String,
}

/// Owns validated input. Callers cannot replace records or alter reviewed counts.
pub struct Preview {
    review: Review,
    summary: Summary,
    uid: String,
    server: String,
    timezone: Option<i32>,
    records: Vec<(String, String)>,
    snapshot: (String, i64),
}
impl Preview {
    pub fn summary(&self) -> Summary {
        self.summary
    }
    pub fn review(&self) -> &Review {
        &self.review
    }
}

/// Keeps local history access and transactional import rules behind one boundary.
pub struct Store {
    connection: Connection,
}
impl Store {
    /// Only the native caller selects a database path; never expose this as a UI command.
    pub fn open(path: &Path) -> Result<Self, Error> {
        Self::initialize(Connection::open(path)?)
    }

    /// Establish a usable store atomically, refusing to repurpose an incompatible database.
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
        } else if (version, app) != (2, APPLICATION_ID) {
            return Err(Error::Schema);
        }
        snapshot(&tx)?;
        tx.commit()?;
        Ok(Self { connection })
    }

    /// Preview all pages atomically; ambiguous or mismatched context blocks the batch.
    pub fn preview(&mut self, uid: &str, server: &str, bytes: &[&[u8]]) -> Result<Preview, Error> {
        if !crate::hsr::digits(uid) || server.trim().is_empty() {
            return Err(Error::Context);
        }
        if bytes
            .iter()
            .fold(0usize, |size, page| size.saturating_add(page.len()))
            > MAX_BATCH_BYTES
        {
            return Err(Error::TooLarge);
        }
        // None means no page seen; Some(None) means a page with unknown offset.
        let mut timezone: Option<Option<i32>> = None;
        let mut records = Vec::new();
        // Each record's category and time, for the review.
        let mut details = Vec::new();
        for bytes in bytes {
            let page = parse_response(bytes)?;
            if page
                .region
                .as_deref()
                .is_some_and(|region| region != server)
            {
                return Err(Error::Context);
            }
            if timezone.is_some_and(|first| first != page.region_time_zone) {
                return Err(Error::Context);
            }
            for roll in &page.list {
                if roll.uid != uid {
                    return Err(Error::Context);
                }
                records.push((roll.id.clone(), serde_json::json!(roll).to_string()));
                details.push((roll.gacha_type.clone(), roll.time.clone()));
            }
            timezone = Some(page.region_time_zone);
        }
        if records.is_empty() {
            return Err(Error::Empty);
        }
        let timezone = timezone.flatten();
        let tx = self.connection.transaction()?;
        check_timezone(&tx, uid, server, timezone)?;
        let statuses = classify(&tx, uid, server, &records)?;
        let summary = Summary::of(&statuses);
        let mut by_category: BTreeMap<&str, Summary> = BTreeMap::new();
        let mut conflicts = Vec::new();
        for (((id, _), (gacha_type, time)), status) in records.iter().zip(&details).zip(statuses) {
            by_category.entry(gacha_type).or_default().count(status);
            if status == Status::Conflict {
                conflicts.push(Conflict {
                    id: id.clone(),
                    gacha_type: gacha_type.clone(),
                    time: time.clone(),
                });
            }
        }
        // Validated times share one canonical format and offset, so text order is
        // time order.
        let times = details.iter().map(|(_, time)| time);
        let review = Review {
            uid: uid.to_owned(),
            server: server.to_owned(),
            timezone,
            summary,
            categories: Category::ALL
                .iter()
                .map(|category| CategoryCounts {
                    gacha_type: category.code(),
                    counts: by_category
                        .get(category.code())
                        .copied()
                        .unwrap_or_default(),
                })
                .collect(),
            earliest: times.clone().min().cloned().unwrap_or_default(),
            latest: times.max().cloned().unwrap_or_default(),
            conflicts,
        };
        let preview = Preview {
            review,
            summary,
            uid: uid.to_owned(),
            server: server.to_owned(),
            timezone,
            records,
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
        let statuses = classify(&tx, &preview.uid, &preview.server, &preview.records)?;
        let current = Summary::of(&statuses);
        if current != preview.summary {
            return Err(Error::StalePreview);
        }
        tx.execute("INSERT INTO accounts(game,uid,server,timezone) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING",
            params![GAME, preview.uid, preview.server, preview.timezone])?;
        tx.execute(
            "INSERT INTO batches(game,uid,server,adapter,imported_at,inserted,duplicates,conflicts) VALUES (?1,?2,?3,'hsr-api-v1',?4,?5,?6,0)",
            params![GAME, preview.uid, preview.server, imported_at, current.inserted as i64, current.duplicates as i64],
        )?;
        let batch = tx.last_insert_rowid();
        {
            let mut insert = tx.prepare("INSERT INTO rolls(game,uid,server,id,payload,first_batch) VALUES (?1,?2,?3,?4,?5,?6)")?;
            let new_records = preview.records.iter().zip(&statuses);
            for ((id, payload), _) in new_records.filter(|(_, status)| **status == Status::New) {
                insert.execute(params![
                    GAME,
                    preview.uid,
                    preview.server,
                    id,
                    payload,
                    batch
                ])?;
            }
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
            "SELECT id,payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 ORDER BY id",
        )?;
        let rows = statement.query_map(params![GAME, uid, server], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut records = Vec::new();
        for row in rows {
            let (id, payload) = row?;
            crate::validate_json(payload.as_bytes())?;
            let record: Roll = serde_json::from_str(&payload)?;
            if record.uid != uid || record.id != id || !crate::hsr::valid_roll(&record) {
                return Err(Error::InvalidStoredData);
            }
            records.push(record);
        }
        Ok(records)
    }
}

/// Block merges that would silently change how an account's source times are interpreted.
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

/// Bind a preview to one database revision so later writes require renewed review.
fn snapshot(connection: &Connection) -> Result<(String, i64), Error> {
    Ok(connection.query_row(
        "SELECT database_id,revision FROM metadata WHERE singleton=1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?)
}

/// Compare scoped identities with stored and earlier incoming rolls to expose conflicts
/// and identify which records need insertion, without writing any state.
fn classify(
    connection: &Connection,
    uid: &str,
    server: &str,
    records: &[(String, String)],
) -> Result<Vec<Status>, Error> {
    let mut statuses = Vec::new();
    let mut query = connection
        .prepare("SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND id=?4")?;
    let mut seen: BTreeMap<&String, String> = BTreeMap::new();
    for (id, payload) in records {
        let previous = if let Some(previous) = seen.get(id) {
            Some(previous.clone())
        } else {
            query
                .query_row(params![GAME, uid, server, id], |row| {
                    row.get::<_, String>(0)
                })
                .optional()?
        };
        match previous {
            Some(previous) => {
                statuses.push(if previous == *payload {
                    Status::Duplicate
                } else {
                    Status::Conflict
                });
                seen.insert(id, previous);
            }
            None => {
                statuses.push(Status::New);
                seen.insert(id, payload.clone());
            }
        }
    }
    Ok(statuses)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    pub(crate) mod database;
    use database::{Reply, Step};
    use rusqlite::types::Value;
    const PAGE: &[u8] = include_bytes!("../tests/fixtures/hsr-api/page.json");
    const UID: &str = "100000002";
    const SERVER: &str = "synthetic-server";
    const SNAPSHOT: &str = "SELECT database_id,revision FROM metadata WHERE singleton=1";
    const TIMEZONE: &str = "SELECT timezone FROM accounts WHERE game=?1 AND uid=?2 AND server=?3";
    const LOOKUP: &str =
        "SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND id=?4";
    const HISTORY: &str =
        "SELECT id,payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 ORDER BY id";
    pub(crate) fn text(value: &str) -> Value {
        Value::Text(value.into())
    }
    pub(crate) fn step(sql: &str, bindings: Vec<Value>, reply: Reply) -> Step {
        Step {
            sql: sql.into(),
            bindings,
            reply: Ok(reply),
        }
    }
    fn done(sql: &str) -> Step {
        step(sql, vec![], Reply::Done)
    }
    fn rows(sql: &str, bindings: Vec<Value>, rows: Vec<Vec<Value>>) -> Step {
        step(
            sql,
            bindings,
            Reply::Rows(rows.into_iter().map(Ok).collect()),
        )
    }
    fn scope() -> Vec<Value> {
        vec![text(GAME), text(UID), text(SERVER)]
    }
    fn identity() -> Step {
        rows(
            SNAPSHOT,
            vec![],
            vec![vec![text("database"), Value::Integer(0)]],
        )
    }
    fn timezone(value: Option<Option<i32>>) -> Step {
        rows(
            TIMEZONE,
            scope(),
            value
                .into_iter()
                .map(|value| {
                    vec![
                        value
                            .map(|value| Value::Integer(value.into()))
                            .unwrap_or(Value::Null),
                    ]
                })
                .collect(),
        )
    }
    fn record() -> (String, String) {
        let roll = parse_response(PAGE).unwrap().list.remove(0);
        (roll.id.clone(), serde_json::json!(roll).to_string())
    }
    fn lookup(id: &str, payload: Option<&str>) -> Step {
        let mut bindings = scope();
        bindings.push(text(id));
        rows(
            LOOKUP,
            bindings,
            payload.into_iter().map(|value| vec![text(value)]).collect(),
        )
    }
    fn store() -> Store {
        Store {
            connection: Connection,
        }
    }
    fn preview() -> Preview {
        Preview {
            review: Review::default(),
            summary: Summary {
                inserted: 1,
                duplicates: 0,
                conflicts: 0,
            },
            uid: UID.into(),
            server: SERVER.into(),
            timezone: Some(8),
            records: vec![record()],
            snapshot: ("database".into(), 0),
        }
    }
    /// The SQL for initializing a new or existing database after it is opened.
    pub(crate) fn setup(existing: bool) -> Vec<Step> {
        let mut steps = vec![
            done("PRAGMA busy_timeout=250; PRAGMA foreign_keys=ON;"),
            done("BEGIN Immediate"),
            rows(
                "PRAGMA user_version",
                vec![],
                vec![vec![Value::Integer(if existing { 2 } else { 0 })]],
            ),
            rows(
                "PRAGMA application_id",
                vec![],
                vec![vec![Value::Integer(if existing {
                    APPLICATION_ID.into()
                } else {
                    0
                })]],
            ),
        ];
        if !existing {
            steps.push(rows(
                "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                vec![],
                vec![vec![Value::Integer(0)]],
            ));
            steps.push(done(include_str!("../migrations/001_initial.sql")));
        }
        steps.extend([identity(), done("COMMIT")]);
        steps
    }
    #[test]
    fn opens_and_initializes_only_unclaimed_or_compatible_databases() {
        for existing in [false, true] {
            let mut steps = vec![step("OPEN", vec![text("synthetic.sqlite")], Reply::Done)];
            steps.extend(setup(existing));
            database::expect(steps);
            assert!(Store::open(Path::new("synthetic.sqlite")).is_ok());
            database::finish();
        }
    }
    fn fail_each(
        make: &dyn Fn() -> Vec<Step>,
        begin: Option<usize>,
        action: &mut dyn FnMut() -> Result<(), Error>,
    ) {
        for index in 0..make().len() {
            let mut steps = make();
            if steps[index].sql == "LAST INSERT ID" {
                continue;
            }
            steps.truncate(index + 1);
            steps[index].reply = Err(rusqlite::Error::InvalidQuery);
            if begin.is_some_and(|begin| index > begin) {
                steps.push(done("ROLLBACK"));
            }
            database::expect(steps);
            assert_eq!(action(), Err(Error::Database));
            database::finish();
        }
    }
    fn page(edit: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
        let mut value: serde_json::Value = serde_json::from_slice(PAGE).unwrap();
        edit(&mut value);
        serde_json::to_vec(&value).unwrap()
    }
    fn preview_script() -> Vec<Step> {
        let mut steps = vec![
            done("BEGIN Deferred"),
            timezone(None),
            done(&format!("PREPARE {LOOKUP}")),
        ];
        for roll in parse_response(PAGE).unwrap().list {
            steps.push(lookup(&roll.id, None));
        }
        steps.extend([identity(), done("COMMIT")]);
        steps
    }
    const ACCOUNTS: &str = "INSERT INTO accounts(game,uid,server,timezone) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING";
    const BATCH: &str = "INSERT INTO batches(game,uid,server,adapter,imported_at,inserted,duplicates,conflicts) VALUES (?1,?2,?3,'hsr-api-v1',?4,?5,?6,0)";
    const INSERT: &str =
        "INSERT INTO rolls(game,uid,server,id,payload,first_batch) VALUES (?1,?2,?3,?4,?5,?6)";
    const REVISION: &str = "UPDATE metadata SET revision=revision+1 WHERE singleton=1";
    fn commit_script(duplicate: bool) -> Vec<Step> {
        let (id, payload) = record();
        let mut account_bindings = scope();
        account_bindings.push(Value::Integer(8));
        let mut batch_bindings = scope();
        batch_bindings.extend([
            Value::Integer(1234),
            Value::Integer(i64::from(!duplicate)),
            Value::Integer(i64::from(duplicate)),
        ]);
        let mut steps = vec![
            done("BEGIN Immediate"),
            identity(),
            timezone(Some(Some(8))),
            done(&format!("PREPARE {LOOKUP}")),
            lookup(&id, if duplicate { Some(&payload) } else { None }),
            step(ACCOUNTS, account_bindings, Reply::Count(1)),
            step(BATCH, batch_bindings, Reply::Count(1)),
            step("LAST INSERT ID", vec![], Reply::Id(7)),
            done(&format!("PREPARE {INSERT}")),
        ];
        if !duplicate {
            let mut bindings = scope();
            bindings.extend([text(&id), text(&payload), Value::Integer(7)]);
            steps.push(step(INSERT, bindings, Reply::Count(1)));
        }
        steps.extend([step(REVISION, vec![], Reply::Count(1)), done("COMMIT")]);
        steps
    }

    #[test]
    fn initialization_errors_are_safe_and_rollback_after_begin() {
        fail_each(&|| setup(false), Some(1), &mut || {
            Store::initialize(Connection).map(|_| ())
        });
        database::expect(vec![Step {
            sql: "OPEN".into(),
            bindings: vec![text("synthetic")],
            reply: Err(rusqlite::Error::InvalidQuery),
        }]);
        assert!(matches!(
            Store::open(Path::new("synthetic")),
            Err(Error::Database)
        ));
        database::finish();
    }
    #[test]
    fn initialization_rejects_incompatible_or_claimed_databases() {
        for (version, app) in [(3, APPLICATION_ID), (2, 0), (0, APPLICATION_ID)] {
            let mut steps = setup(true);
            steps.truncate(4);
            steps[2] = rows(
                "PRAGMA user_version",
                vec![],
                vec![vec![Value::Integer(version)]],
            );
            steps[3] = rows(
                "PRAGMA application_id",
                vec![],
                vec![vec![Value::Integer(app.into())]],
            );
            steps.push(done("ROLLBACK"));
            database::expect(steps);
            assert!(matches!(Store::initialize(Connection), Err(Error::Schema)));
            database::finish();
        }
        let mut steps = setup(false);
        steps.truncate(5);
        steps[4] = rows(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            vec![],
            vec![vec![Value::Integer(1)]],
        );
        steps.push(done("ROLLBACK"));
        database::expect(steps);
        assert!(matches!(Store::initialize(Connection), Err(Error::Schema)));
        database::finish();
    }
    #[test]
    fn metadata_column_failures_are_safe() {
        for row in [
            vec![Value::Null, Value::Integer(0)],
            vec![text("database"), text("invalid revision")],
        ] {
            database::expect(vec![rows(SNAPSHOT, vec![], vec![row])]);
            assert_eq!(snapshot(&Connection), Err(Error::Database));
            database::finish();
        }
    }
    #[test]
    fn timezone_evidence_is_preserved_without_guessing() {
        for (stored, incoming, result) in [
            (None, None, Ok(())),
            (Some(None), None, Ok(())),
            (Some(Some(8)), Some(8), Ok(())),
            (Some(None), Some(8), Err(Error::Context)),
            (Some(Some(8)), None, Err(Error::Context)),
        ] {
            database::expect(vec![timezone(stored)]);
            assert_eq!(check_timezone(&Connection, UID, SERVER, incoming), result);
            database::finish();
        }
        database::expect(vec![rows(TIMEZONE, scope(), vec![vec![text("invalid")]])]);
        assert_eq!(
            check_timezone(&Connection, UID, SERVER, None),
            Err(Error::Database)
        );
        database::finish();
    }
    #[test]
    fn classification_reuses_first_seen_identity_and_never_writes() {
        database::expect(vec![
            done(&format!("PREPARE {LOOKUP}")),
            lookup("001", None),
        ]);
        let records = vec![
            ("001".into(), "a".into()),
            ("001".into(), "a".into()),
            ("001".into(), "b".into()),
        ];
        assert_eq!(
            classify(&Connection, UID, SERVER, &records).unwrap(),
            [Status::New, Status::Duplicate, Status::Conflict]
        );
        database::finish();
        database::expect(vec![
            done(&format!("PREPARE {LOOKUP}")),
            lookup("001", Some("a")),
        ]);
        assert_eq!(
            classify(&Connection, UID, SERVER, &records).unwrap(),
            [Status::Duplicate, Status::Duplicate, Status::Conflict]
        );
        database::finish();
    }
    #[test]
    fn lookup_decode_failures_are_safe() {
        let mut bindings = scope();
        bindings.push(text("001"));
        database::expect(vec![
            done(&format!("PREPARE {LOOKUP}")),
            rows(LOOKUP, bindings, vec![vec![Value::Integer(3)]]),
        ]);
        assert_eq!(
            classify(&Connection, UID, SERVER, &[("001".into(), "a".into())]),
            Err(Error::Database)
        );
        database::finish();
    }
    #[test]
    fn the_review_counts_each_category_and_locates_conflicts() {
        let bytes = page(|value| {
            let list = value["data"]["list"].as_array_mut().unwrap();
            let mut new = list[0].clone();
            new["id"] = serde_json::json!("1000000000000000001");
            new["gacha_type"] = serde_json::json!("1");
            new["time"] = serde_json::json!("2023-01-01 00:00:00");
            list.push(new);
        });
        let rolls = parse_response(&bytes).unwrap().list;
        let payload = |index: usize| serde_json::json!(rolls[index]).to_string();
        // The first record is already stored, the second differs from its stored
        // copy, and the third is new.
        database::expect(vec![
            done("BEGIN Deferred"),
            timezone(None),
            done(&format!("PREPARE {LOOKUP}")),
            lookup(&rolls[0].id, Some(&payload(0))),
            lookup(&rolls[1].id, Some("stored differently")),
            lookup(&rolls[2].id, None),
            identity(),
            done("COMMIT"),
        ]);
        let preview = store().preview(UID, SERVER, &[&bytes]).unwrap();
        database::finish();
        let counts = |gacha_type, inserted, duplicates, conflicts| {
            serde_json::json!({
                "gacha_type": gacha_type, "inserted": inserted,
                "duplicates": duplicates, "conflicts": conflicts,
            })
        };
        assert_eq!(
            serde_json::to_value(preview.review()).unwrap(),
            serde_json::json!({
                "uid": UID, "server": SERVER, "timezone": 8,
                "summary": { "inserted": 1, "duplicates": 1, "conflicts": 1 },
                "categories": [
                    counts("1", 1, 0, 0), counts("2", 0, 0, 0), counts("11", 0, 1, 1),
                    counts("12", 0, 0, 0), counts("21", 0, 0, 0), counts("22", 0, 0, 0),
                ],
                "earliest": "2023-01-01 00:00:00",
                "latest": "2024-02-29 12:34:56",
                "conflicts": [
                    { "id": "9007199254740992", "gacha_type": "11", "time": "2024-02-29 12:34:56" },
                ],
            })
        );
    }

    #[test]
    fn preview_owns_validated_records_and_has_no_write_operations() {
        database::expect(preview_script());
        let mut bytes = PAGE.to_vec();
        let preview = store().preview(UID, SERVER, &[&bytes]).unwrap();
        bytes.fill(0);
        assert_eq!(
            preview.summary(),
            Summary {
                inserted: 2,
                duplicates: 0,
                conflicts: 0
            }
        );
        assert_eq!(preview.records[0], record());
        assert_eq!(preview.timezone, Some(8));
        assert_eq!(preview.snapshot, ("database".into(), 0));
        database::finish();
    }
    #[test]
    fn preview_rejects_invalid_context_before_database_access() {
        database::expect(vec![]);
        for (uid, server) in [
            ("invalid", SERVER),
            (UID, " "),
            ("100000001", SERVER),
            (UID, "different"),
        ] {
            assert!(matches!(
                store().preview(uid, server, &[PAGE]),
                Err(Error::Context)
            ));
        }
        assert!(matches!(
            store().preview(UID, SERVER, &[b"not json"]),
            Err(Error::Parse(_))
        ));
        assert!(matches!(
            store().preview(UID, SERVER, &[]),
            Err(Error::Empty)
        ));
        let too_large = vec![0; MAX_BATCH_BYTES + 1];
        assert!(matches!(
            store().preview(UID, SERVER, &[&too_large]),
            Err(Error::TooLarge)
        ));
        database::finish();
    }
    #[test]
    fn preview_rejects_cross_page_timezone_changes() {
        let unknown = page(|value| {
            value["data"]["region_time_zone"] = serde_json::Value::Null;
        });
        database::expect(vec![]);
        assert!(matches!(
            store().preview(UID, SERVER, &[PAGE, &unknown]),
            Err(Error::Context)
        ));
        database::finish();
    }
    #[test]
    fn preview_retains_unknown_context_and_empty_terminal_page_evidence() {
        let unknown = page(|value| {
            value["data"]["region_time_zone"] = serde_json::Value::Null;
            value["data"]["region"] = serde_json::Value::Null;
        });
        let empty = page(|value| {
            value["data"]["list"] = serde_json::json!([]);
            value["data"]["region_time_zone"] = serde_json::Value::Null;
        });
        database::expect(preview_script());
        let preview = store().preview(UID, SERVER, &[&unknown, &empty]).unwrap();
        assert_eq!(preview.timezone, None);
        assert_eq!(preview.records.len(), 2);
        database::finish();
    }
    #[test]
    fn preview_database_failures_rollback_and_do_not_return_partial_previews() {
        fail_each(&preview_script, Some(0), &mut || {
            store().preview(UID, SERVER, &[PAGE]).map(|_| ())
        });
        database::expect(vec![
            done("BEGIN Deferred"),
            timezone(Some(Some(9))),
            done("ROLLBACK"),
        ]);
        assert!(matches!(
            store().preview(UID, SERVER, &[PAGE]),
            Err(Error::Context)
        ));
        database::finish();
    }
    #[test]
    fn commit_binds_account_payload_provenance_and_caller_time_atomically() {
        database::expect(commit_script(false));
        assert_eq!(
            store().commit(preview(), 1234),
            Ok(Summary {
                inserted: 1,
                duplicates: 0,
                conflicts: 0
            })
        );
        database::finish();
    }
    #[test]
    fn duplicate_commit_only_adds_a_compact_summary_and_revision() {
        let mut preview = preview();
        preview.summary = Summary {
            inserted: 0,
            duplicates: 1,
            conflicts: 0,
        };
        database::expect(commit_script(true));
        assert_eq!(
            store().commit(preview, 1234),
            Ok(Summary {
                inserted: 0,
                duplicates: 1,
                conflicts: 0
            })
        );
        database::finish();
    }
    #[test]
    fn commit_conflicts_and_stale_previews_do_not_write() {
        let mut conflict = preview();
        conflict.summary.conflicts = 1;
        database::expect(vec![]);
        assert_eq!(store().commit(conflict, 0), Err(Error::Conflict));
        database::finish();
        database::expect(vec![
            done("BEGIN Immediate"),
            rows(
                SNAPSHOT,
                vec![],
                vec![vec![text("another database"), Value::Integer(1)]],
            ),
            done("ROLLBACK"),
        ]);
        assert_eq!(store().commit(preview(), 0), Err(Error::StalePreview));
        database::finish();
        let (id, payload) = record();
        database::expect(vec![
            done("BEGIN Immediate"),
            identity(),
            timezone(None),
            done(&format!("PREPARE {LOOKUP}")),
            lookup(&id, Some(&payload)),
            done("ROLLBACK"),
        ]);
        assert_eq!(store().commit(preview(), 0), Err(Error::StalePreview));
        database::finish();
        database::expect(vec![
            done("BEGIN Immediate"),
            identity(),
            timezone(Some(Some(9))),
            done("ROLLBACK"),
        ]);
        assert_eq!(store().commit(preview(), 0), Err(Error::Context));
        database::finish();
    }
    #[test]
    fn commit_failures_rollback_instead_of_returning_success() {
        fail_each(&|| commit_script(false), Some(0), &mut || {
            store().commit(preview(), 1234).map(|_| ())
        });
    }
    fn history_script(rows_data: Vec<Vec<Value>>) -> Vec<Step> {
        vec![
            done(&format!("PREPARE {HISTORY}")),
            rows(HISTORY, scope(), rows_data),
        ]
    }
    #[test]
    fn history_returns_only_valid_scoped_records_in_database_order() {
        let (id, payload) = record();
        database::expect(history_script(vec![vec![text(&id), text(&payload)]]));
        assert_eq!(
            store().history(UID, SERVER).unwrap(),
            vec![parse_response(PAGE).unwrap().list.remove(0)]
        );
        database::finish();
    }
    #[test]
    fn history_query_and_row_failures_are_safe() {
        fail_each(&|| history_script(vec![]), None, &mut || {
            store().history(UID, SERVER).map(|_| ())
        });
        for rows_data in [
            vec![vec![Value::Null, text("{}")]],
            vec![vec![text("1"), Value::Null]],
        ] {
            database::expect(history_script(rows_data));
            assert_eq!(store().history(UID, SERVER), Err(Error::Database));
            database::finish();
        }
        database::expect(vec![
            done(&format!("PREPARE {HISTORY}")),
            step(
                HISTORY,
                scope(),
                Reply::Rows(vec![Err(rusqlite::Error::InvalidQuery)]),
            ),
        ]);
        assert_eq!(store().history(UID, SERVER), Err(Error::Database));
        database::finish();
    }
    #[test]
    fn history_rejects_corrupt_payloads_and_identity_without_partial_results() {
        let (id, payload) = record();
        let mut corrupt = vec!["{".into(), "{}".into(), "{\"id\":1,\"id\":2}".into()];
        for (field, value) in [
            ("uid", "100000001"),
            ("id", "001"),
            ("gacha_type", "invalid"),
        ] {
            let mut record: serde_json::Value = serde_json::from_str(&payload).unwrap();
            record[field] = text_json(value);
            corrupt.push(record.to_string());
        }
        for corrupt in corrupt {
            database::expect(history_script(vec![
                vec![text(&id), text(&payload)],
                vec![text(&id), text(&corrupt)],
            ]));
            assert_eq!(store().history(UID, SERVER), Err(Error::InvalidStoredData));
            database::finish();
        }
    }
    fn text_json(value: &str) -> serde_json::Value {
        serde_json::Value::String(value.into())
    }
}
