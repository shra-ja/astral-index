//! Local SQLite storage and immutable import previews. No acquisition or UI access.
#[cfg(test)]
use self::tests::database::Connection;
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::hsr::{Category, SoftPity};
use crate::{MAX_BATCH_BYTES, ParseError, Roll, parse_response};
#[cfg(not(test))]
use rusqlite::Connection;
use rusqlite::{OpenFlags, OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
#[cfg(not(test))]
use std::fs;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
};

const GAME: &str = "honkai-star-rail";
const APPLICATION_ID: i32 = 1381257795;
/// The schema version the first release wrote, which `001_initial.sql` creates
/// ([decision 0029](../../docs/architecture/decisions/0029-automated-release-verification.md)).
/// Version 1 was a pre-release layout and is refused.
const FIRST_RELEASED: i32 = 2;
const FIRST_SQL: &str = include_str!("../migrations/001_initial.sql");
/// The migrations after the first release, in order, each upgrading the schema
/// version before it by one. None yet: the schema has not changed since 1.0.0.
const MIGRATIONS: &[&str] = &[];
/// How many references a database holds to rows that don't exist.
const BROKEN_REFERENCES: &str = "SELECT count(*) FROM pragma_foreign_key_check";
/// A database's schema objects, as compared between a file and its version's SQL.
const SCHEMA: &str =
    "SELECT json_array(type,name,tbl_name,sql) FROM sqlite_schema ORDER BY type,name";

/// A schema: the first release's, then its migrations in order. Each version from
/// the first release's to the newest is released, and its expected schema is the
/// one these steps produce, so a new database is built by the same steps as an
/// upgraded one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Schema {
    migrations: &'static [&'static str],
}
impl Schema {
    /// This app's schema.
    pub const CURRENT: Self = Self {
        migrations: MIGRATIONS,
    };
    /// The schema these migrations produce from the first release's. Only tests
    /// use any other than `CURRENT`.
    pub const fn with_migrations(migrations: &'static [&'static str]) -> Self {
        Self { migrations }
    }
    /// How many of these migrations a database at schema `version` already has:
    /// none unless `version` is one of this schema's released versions, from the
    /// first release's to the newest.
    fn applied(self, version: i32) -> Option<usize> {
        let applied = usize::try_from(version.saturating_sub(FIRST_RELEASED)).ok()?;
        (applied <= self.migrations.len()).then_some(applied)
    }
    /// Whether a database with `applied` of these migrations needs none more.
    fn is_newest(self, applied: usize) -> bool {
        applied == self.migrations.len()
    }
    /// This schema as it was with only its first `applied` migrations, as
    /// `applied` gives them.
    fn at(self, applied: usize) -> Self {
        Self {
            migrations: &self.migrations[..applied],
        }
    }
    /// Bring a database that has `applied` of these migrations, or a new one, to
    /// this schema, raising its version after each migration.
    fn build(self, connection: &Connection, applied: Option<usize>) -> rusqlite::Result<()> {
        let applied = match applied {
            Some(applied) => applied,
            None => {
                connection.execute_batch(FIRST_SQL)?;
                0
            }
        };
        let pending = (FIRST_RELEASED + 1..).zip(self.migrations);
        for (version, migration) in pending.skip(applied) {
            connection.execute_batch(migration)?;
            connection.execute_batch(&format!("PRAGMA user_version={version}"))?;
        }
        Ok(())
    }
}

/// What a caller does with an older release's database before it is upgraded,
/// given its schema version.
pub type Keep<'a> = &'a mut dyn FnMut(i32) -> Result<(), Error>;

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
    /// The history is from an older release and couldn't be upgraded, so it is as
    /// it was. Names the copy kept before the upgrade, if one was made. Only the
    /// desktop's database, which keeps the copy, reports it.
    NotUpgraded(Option<String>),
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
#[derive(Clone, Default, Serialize)]
pub struct Review {
    uid: String,
    server: String,
    /// UTC offset in hours of the server-local times, when the responses gave one.
    timezone: Option<i32>,
    summary: Summary,
    /// New rows of each highlighted rarity, counted per row, not per item.
    new_five_star: usize,
    new_four_star: usize,
    /// Counts for each known category, in fetch order, including empty ones.
    categories: Vec<CategoryCounts>,
    /// Earliest and latest server-local record times in the import.
    earliest: String,
    latest: String,
    conflicts: Vec<Conflict>,
}
#[derive(Clone, Serialize)]
struct CategoryCounts {
    gacha_type: &'static str,
    #[serde(flatten)]
    counts: Summary,
}
/// Where an incoming record disagrees with a stored or earlier record of the same ID.
#[derive(Clone, Serialize)]
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

/// The account an import last went into. Holds a player identifier: never log it.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Account {
    pub uid: String,
    pub server: String,
    /// UTC offset in hours of the server-local times, when known.
    pub timezone: Option<i32>,
}

/// A saved account of the game, for the account switcher. Holds a player identifier:
/// never log it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SavedAccount {
    pub uid: String,
    pub server: String,
    /// UTC offset in hours of the server-local times, when known.
    pub timezone: Option<i32>,
    /// Rolls stored for the account in every category.
    pub rolls: usize,
}

/// The newest import's summary, for the Import screen. Holds a player identifier:
/// never log it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LastImport {
    /// When it was saved, in Unix seconds by this device's clock.
    pub imported_at: i64,
    pub source: Source,
    pub uid: String,
    pub server: String,
    /// Rolls it added; rolls already saved are not counted.
    pub inserted: usize,
}

/// What a history holds, for comparing a backup with the current history before
/// restoring it: the game's accounts with their roll totals, and its newest import.
/// Holds player identifiers: never log it.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Contents {
    pub accounts: Vec<SavedAccount>,
    pub last_import: Option<LastImport>,
}

/// Where an import came from, without exposing internal adapter names.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// Retrieved from HoYoverse's history API.
    Hoyoverse,
}

/// Saved roll IDs of the game by account, for a quick refresh's stop check
/// ([decision 0015](../../docs/architecture/decisions/0015-incremental-retrieval.md)). Holds
/// player identifiers: never log it.
#[derive(Default)]
pub struct SavedRolls {
    accounts: HashMap<(String, String), HashSet<String>>,
}
impl SavedRolls {
    /// Whether any of `ids` is saved for the account with this UID and server.
    pub fn any<'a>(&self, uid: &str, server: &str, mut ids: impl Iterator<Item = &'a str>) -> bool {
        let key = (uid.to_owned(), server.to_owned());
        self.accounts
            .get(&key)
            .is_some_and(|saved| ids.any(|id| saved.contains(id)))
    }
}

/// One page of an account's rolls in one category, newest first, for display.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct HistoryPage {
    /// Rolls in the category altogether.
    pub total: usize,
    /// Rolls in the category of the rarities shown, so callers can page through them.
    pub matched: usize,
    /// Where the category's 5★ pity is near soft pity and in it, when known.
    pub soft_pity: Option<SoftPity>,
    /// Every known category's count for the account, empty ones included, so a
    /// caller can show them all without reading each.
    pub categories: Vec<CategoryTotal>,
    /// The whole category, not just this page.
    pub summary: CategorySummary,
    pub rolls: Vec<StoredRoll>,
}
impl HistoryPage {
    /// No rolls in any category.
    pub fn empty() -> Self {
        Self {
            total: 0,
            matched: 0,
            soft_pity: None,
            categories: Category::ALL
                .into_iter()
                .map(|category| CategoryTotal {
                    gacha_type: category.code(),
                    total: 0,
                })
                .collect(),
            summary: CategorySummary::default(),
            rolls: Vec::new(),
        }
    }
}

/// Which rarities a history page shows. Hidden rolls keep their place in the
/// category's numbering, and the category's counts still include them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rarities {
    pub five: bool,
    pub four: bool,
    pub three: bool,
}
impl Rarities {
    pub const ALL: Self = Self {
        five: true,
        four: true,
        three: true,
    };

    /// Whether a roll of this stored rarity is shown; another rarity is damage.
    fn shows(self, rank: &str) -> Result<bool, Error> {
        match rank {
            "5" => Ok(self.five),
            "4" => Ok(self.four),
            "3" => Ok(self.three),
            _ => Err(Error::InvalidStoredData),
        }
    }
}

/// Which rolls a history page shows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Filter {
    pub rarities: Rarities,
    /// Shown when a roll's name contains it, ignoring case and surrounding spaces;
    /// empty shows every name.
    pub name: String,
    /// The first and last server dates shown, as `YYYY-MM-DD`, each a whole day;
    /// none leaves that end open.
    pub from: Option<String>,
    pub to: Option<String>,
}
impl Default for Filter {
    fn default() -> Self {
        Self {
            rarities: Rarities::ALL,
            name: String::new(),
            from: None,
            to: None,
        }
    }
}
impl Filter {
    /// Whether a roll at this server time falls within the dates shown.
    fn shows_time(&self, time: &str) -> bool {
        let day = time.get(..10).unwrap_or(time);
        self.from.as_deref().is_none_or(|from| day >= from)
            && self.to.as_deref().is_none_or(|to| day <= to)
    }

    /// Whether `name` contains `search`, which is already folded.
    fn matches_name(name: &str, search: &str) -> bool {
        fold(name).contains(search)
    }
}

/// Text with its case folded by Unicode rules, so a search ignores case in any script.
fn fold(text: &str) -> String {
    text.to_lowercase()
}

/// A category's rarity counts and stored period, for the summary strip.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct CategorySummary {
    pub five_star: usize,
    pub four_star: usize,
    /// Server times of the oldest and newest stored rolls; none without rolls.
    pub first: Option<String>,
    pub last: Option<String>,
}

/// How many rolls an account has stored in one category.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct CategoryTotal {
    pub gacha_type: &'static str,
    pub total: usize,
}

/// A stored roll as the history list shows it. `number` is its position in the
/// category, counting from 1 at the oldest stored roll.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct StoredRoll {
    pub number: usize,
    /// Rolls since the previous 5★ in the category, counting this one, so a 5★
    /// shows the pity it came at ([decision 0019](../../docs/architecture/decisions/0019-pity-derived-on-read.md)).
    pub pity: usize,
    pub id: String,
    pub name: String,
    pub item_type: String,
    pub rank_type: String,
    pub time: String,
}

/// Keeps local history access and transactional import rules behind one boundary.
pub struct Store {
    connection: Connection,
}
impl Store {
    /// Only the native caller selects a database path; never expose this as a UI command.
    /// A database from an older release is upgraded without keeping it first, as
    /// for a copy.
    pub fn open(path: &Path) -> Result<Self, Error> {
        Self::open_with(path, Schema::CURRENT, None)
    }

    /// Open the database at `path` with `schema`. A database from an older release
    /// is upgraded, after `keep`, if given, is given its version while nothing of
    /// it has changed, so the caller can copy the file first; a `keep` that fails
    /// stops the upgrade.
    pub fn open_with(path: &Path, schema: Schema, keep: Option<Keep<'_>>) -> Result<Self, Error> {
        Self::initialize(Connection::open(path)?, schema, keep)
    }

    /// Establish a usable store atomically, refusing to repurpose an incompatible
    /// database. Creating or upgrading runs in the one transaction, so a failure
    /// leaves the database as it was. References are enforced only once it
    /// commits, as SQLite's procedure for schema changes requires: a migration may
    /// rebuild a table others refer to, and SQLite can't stop enforcing them inside
    /// a transaction. An upgrade checks every reference before it commits instead.
    fn initialize(
        mut connection: Connection,
        schema: Schema,
        keep: Option<Keep<'_>>,
    ) -> Result<Self, Error> {
        connection.execute_batch("PRAGMA busy_timeout=250; PRAGMA foreign_keys=OFF;")?;
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
            schema.build(&tx, None)?;
        } else {
            let applied = (app == APPLICATION_ID)
                .then(|| schema.applied(version))
                .flatten()
                .ok_or(Error::Schema)?;
            if !schema.is_newest(applied) {
                if let Some(keep) = keep {
                    keep(version)?;
                }
                schema.build(&tx, Some(applied))?;
                let broken: i64 = tx.query_row(BROKEN_REFERENCES, [], |row| row.get(0))?;
                if broken != 0 {
                    return Err(Error::Database);
                }
            }
        }
        snapshot(&tx)?;
        tx.commit()?;
        connection.execute_batch("PRAGMA foreign_keys=ON")?;
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
        // Each record's category, time and rarity, for the review.
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
                details.push((
                    roll.gacha_type.clone(),
                    roll.time.clone(),
                    roll.rank_type.clone(),
                ));
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
        let (mut new_five_star, mut new_four_star) = (0, 0);
        for (((id, _), (gacha_type, time, rarity)), status) in
            records.iter().zip(&details).zip(statuses)
        {
            by_category.entry(gacha_type).or_default().count(status);
            if status == Status::New {
                match rarity.as_str() {
                    "5" => new_five_star += 1,
                    "4" => new_four_star += 1,
                    _ => {}
                }
            }
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
        let times = details.iter().map(|(_, time, _)| time);
        let review = Review {
            uid: uid.to_owned(),
            server: server.to_owned(),
            timezone,
            summary,
            new_five_star,
            new_four_star,
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

    /// Write a consistent copy of the whole database to `path`, which must be missing
    /// or empty ([decision 0031](../../docs/architecture/decisions/0031-sqlite-snapshot-backups.md)).
    /// SQLite takes the path as text, so a path that is not UTF-8 is refused rather
    /// than written under another name.
    pub fn write_snapshot(&self, path: &Path) -> Result<(), Error> {
        let path = path.to_str().ok_or(Error::Database)?;
        self.connection.execute("VACUUM INTO ?1", params![path])?;
        Ok(())
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
            records.push(stored(uid, &id, &payload)?);
        }
        Ok(records)
    }

    /// Every saved roll ID of this game, grouped by account.
    pub fn saved_rolls(&self) -> Result<SavedRolls, Error> {
        let mut statement = self
            .connection
            .prepare("SELECT uid,server,id FROM rolls WHERE game=?1")?;
        let rows = statement.query_map(params![GAME], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut saved = SavedRolls::default();
        for row in rows {
            let (uid, server, id) = row?;
            saved.accounts.entry((uid, server)).or_default().insert(id);
        }
        Ok(saved)
    }

    /// The newest import of this game, if any.
    pub fn last_import(&self) -> Result<Option<LastImport>, Error> {
        let Some((imported_at, adapter, uid, server, inserted)) = self
            .connection
            .query_row(
                "SELECT imported_at,adapter,uid,server,inserted FROM batches WHERE game=?1 ORDER BY id DESC LIMIT 1",
                params![GAME],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()?
        else {
            return Ok(None);
        };
        // Only known adapters write batches, so another is damage.
        if adapter != "hsr-api-v1" {
            return Err(Error::InvalidStoredData);
        }
        Ok(Some(LastImport {
            imported_at,
            source: Source::Hoyoverse,
            uid,
            server,
            // The schema keeps counts non-negative.
            inserted: usize::try_from(inserted).unwrap_or_default(),
        }))
    }

    /// What the history holds: its accounts, newest import first, and that import.
    pub fn contents(&self) -> Result<Contents, Error> {
        Ok(Contents {
            accounts: self.accounts()?,
            last_import: self.last_import()?,
        })
    }

    /// The account an import last went into, if any.
    pub fn latest_account(&self) -> Result<Option<Account>, Error> {
        Ok(self
            .connection
            .query_row(
                "SELECT b.uid,b.server,a.timezone FROM batches b JOIN accounts a ON a.game=b.game AND a.uid=b.uid AND a.server=b.server WHERE b.game=?1 ORDER BY b.id DESC LIMIT 1",
                params![GAME],
                |row| {
                    Ok(Account {
                        uid: row.get(0)?,
                        server: row.get(1)?,
                        timezone: row.get(2)?,
                    })
                },
            )
            .optional()?)
    }

    /// The game's saved accounts with their roll totals, the one imported into most
    /// recently first.
    pub fn accounts(&self) -> Result<Vec<SavedAccount>, Error> {
        let mut statement = self.connection.prepare(
            "SELECT a.uid,a.server,a.timezone,count(r.id) FROM accounts a LEFT JOIN rolls r ON r.game=a.game AND r.uid=a.uid AND r.server=a.server WHERE a.game=?1 GROUP BY a.uid,a.server ORDER BY (SELECT max(b.id) FROM batches b WHERE b.game=a.game AND b.uid=a.uid AND b.server=a.server) DESC",
        )?;
        let rows = statement.query_map(params![GAME], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i32>>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let mut accounts = Vec::new();
        for row in rows {
            let (uid, server, timezone, rolls) = row?;
            accounts.push(SavedAccount {
                uid,
                server,
                timezone,
                rolls: usize::try_from(rolls).map_err(|_| Error::InvalidStoredData)?,
            });
        }
        Ok(accounts)
    }

    /// The saved account with this UID and server, if there is one.
    pub fn account(&self, uid: &str, server: &str) -> Result<Option<Account>, Error> {
        let timezone: Option<Option<i32>> = self
            .connection
            .query_row(
                "SELECT timezone FROM accounts WHERE game=?1 AND uid=?2 AND server=?3",
                params![GAME, uid, server],
                |row| row.get(0),
            )
            .optional()?;
        Ok(timezone.map(|timezone| Account {
            uid: uid.into(),
            server: server.into(),
            timezone,
        }))
    }

    /// One page of an account's rolls in `category`, newest first: by server time,
    /// then by numeric roll ID within the same second, which matches the descending
    /// order HoYoverse lists them in. Digit-only IDs order numerically by length,
    /// then text.
    pub fn page(
        &self,
        uid: &str,
        server: &str,
        category: Category,
        filter: &Filter,
        offset: usize,
        limit: usize,
    ) -> Result<HistoryPage, Error> {
        let code = category.code();
        let HistoryPage {
            mut total,
            mut categories,
            ..
        } = HistoryPage::empty();
        let mut counts = self.connection.prepare(
            "SELECT json_extract(payload,'$.gacha_type'),count(*) FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 GROUP BY 1",
        )?;
        let counted = counts.query_map(params![GAME, uid, server], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in counted {
            let (counted_code, count) = row?;
            // Imports only store known categories, so another is damage.
            let entry = categories
                .iter_mut()
                .find(|entry| entry.gacha_type == counted_code)
                .ok_or(Error::InvalidStoredData)?;
            // A count is never negative.
            entry.total = usize::try_from(count).unwrap_or_default();
            if counted_code == code {
                total = entry.total;
            }
        }
        // One pass over the whole category, oldest first, summarises it and numbers
        // every roll before the filter hides any, so shown rolls keep their place.
        let mut ordered = self.connection.prepare(
            "SELECT id,json_extract(payload,'$.rank_type'),json_extract(payload,'$.name'),json_extract(payload,'$.time') FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND json_extract(payload,'$.gacha_type')=?4 ORDER BY json_extract(payload,'$.time'),length(id),id",
        )?;
        let rows = ordered.query_map(params![GAME, uid, server, code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let search = fold(filter.name.trim());
        let mut summary = CategorySummary::default();
        let mut shown = Vec::new();
        // Counted from the oldest stored roll, before the filter hides any.
        let mut pity = 0;
        for (index, row) in rows.enumerate() {
            let (id, rank, name, time) = row?;
            pity += 1;
            let roll_pity = pity;
            match rank.as_str() {
                "5" => {
                    summary.five_star += 1;
                    pity = 0;
                }
                "4" => summary.four_star += 1,
                _ => {}
            }
            if filter.rarities.shows(&rank)?
                && Filter::matches_name(&name, &search)
                && filter.shows_time(&time)
            {
                shown.push((index + 1, roll_pity, id));
            }
            if summary.first.is_none() {
                summary.first = Some(time.clone());
            }
            summary.last = Some(time);
        }
        let matched = shown.len();
        // Only the page's rolls are read in full, newest first.
        let mut lookup = self.connection.prepare(
            "SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND id=?4",
        )?;
        let mut rolls = Vec::new();
        for (number, pity, id) in shown.into_iter().rev().skip(offset).take(limit) {
            let payload: String =
                lookup.query_row(params![GAME, uid, server, id], |row| row.get(0))?;
            let roll = stored(uid, &id, &payload)?;
            if roll.gacha_type != code {
                return Err(Error::InvalidStoredData);
            }
            rolls.push(StoredRoll {
                number,
                pity,
                id: roll.id,
                name: roll.name,
                item_type: roll.item_type,
                rank_type: roll.rank_type,
                time: roll.time,
            });
        }
        Ok(HistoryPage {
            total,
            matched,
            soft_pity: category.soft_pity(),
            categories,
            summary,
            rolls,
        })
    }
}

/// A stored roll, checked against its row's identity and the roll rules again, so
/// a damaged database is reported rather than shown.
fn stored(uid: &str, id: &str, payload: &str) -> Result<Roll, Error> {
    crate::validate_json(payload.as_bytes())?;
    let record: Roll = serde_json::from_str(payload)?;
    if record.uid != uid || record.id != id || !crate::hsr::valid_roll(&record) {
        return Err(Error::InvalidStoredData);
    }
    Ok(record)
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

/// The largest database file a check accepts, room for several hundred thousand rolls.
pub const MAX_DATABASE_BYTES: u64 = 256 * 1024 * 1024;

/// Why a database file was refused. Safe to show: no paths or file contents.
#[derive(Debug, PartialEq, Eq, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Refusal {
    /// Larger than `MAX_DATABASE_BYTES`.
    TooLarge,
    /// Empty, or not a SQLite database.
    NotDatabase,
    /// A SQLite database without this app's application ID.
    OtherApp,
    /// Written by a newer version of the app.
    Newer,
    /// This app's database, but with an unreleased version, a schema unlike its
    /// version's or a failed integrity check.
    Damaged,
    /// The file could not be read.
    Unreadable,
}
impl From<rusqlite::Error> for Refusal {
    // SQLite's own codes say whether the file is a database at all, or a damaged one.
    fn from(error: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode::{DatabaseCorrupt, NotADatabase, TooBig};
        match error.sqlite_error_code() {
            Some(NotADatabase) => Self::NotDatabase,
            Some(DatabaseCorrupt | TooBig) => Self::Damaged,
            _ => Self::Unreadable,
        }
    }
}

/// SQLite's limits for an untrusted file, lowered as SQLite's own advice for
/// untrusted databases suggests: ample for this app's schema and queries, and
/// small enough that a hostile file cannot stall the app.
const UNTRUSTED_LIMITS: [(rusqlite::limits::Limit, i32); 11] = {
    use rusqlite::limits::Limit::*;
    [
        (SQLITE_LIMIT_LENGTH, 1_000_000),
        (SQLITE_LIMIT_SQL_LENGTH, 100_000),
        (SQLITE_LIMIT_COLUMN, 100),
        (SQLITE_LIMIT_EXPR_DEPTH, 10),
        (SQLITE_LIMIT_COMPOUND_SELECT, 3),
        (SQLITE_LIMIT_VDBE_OP, 25_000),
        (SQLITE_LIMIT_FUNCTION_ARG, 8),
        (SQLITE_LIMIT_ATTACHED, 0),
        (SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 50),
        (SQLITE_LIMIT_VARIABLE_NUMBER, 10),
        (SQLITE_LIMIT_TRIGGER_DEPTH, 10),
    ]
};

/// Open an untrusted database file read-only, so it is never changed, in SQLite's
/// defensive mode, with its schema distrusted so it cannot run functions with side
/// effects, the lowered limits, no memory mapping and checked cell sizes.
fn open_untrusted(path: &Path) -> Result<Connection, Refusal> {
    use rusqlite::config::DbConfig;
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)?;
    for (limit, value) in UNTRUSTED_LIMITS {
        connection.set_limit(limit, value)?;
    }
    connection.execute_batch("PRAGMA mmap_size=0; PRAGMA cell_size_check=ON;")?;
    Ok(connection)
}

/// Check a database file, treating it as untrusted: at most `MAX_DATABASE_BYTES`,
/// checked before it is opened; then a non-empty database with this app's
/// application ID and a released version of `schema`, with exactly the schema
/// that version's steps build, compared before the integrity check runs the
/// file's schema, and a passing integrity check.
pub fn check_database(path: &Path, schema: Schema) -> Result<(), Refusal> {
    let size = fs::metadata(path).map_err(|_| Refusal::Unreadable)?.len();
    if size > MAX_DATABASE_BYTES {
        return Err(Refusal::TooLarge);
    }
    let connection = open_untrusted(path)?;
    let pages: i64 = connection.query_row("PRAGMA page_count", [], |row| row.get(0))?;
    if pages == 0 {
        return Err(Refusal::NotDatabase);
    }
    let app: i32 = connection.query_row("PRAGMA application_id", [], |row| row.get(0))?;
    if app != APPLICATION_ID {
        return Err(Refusal::OtherApp);
    }
    let version: i32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    // Past the first release's, an unknown version can only be a newer one.
    let applied = schema.applied(version).ok_or(if version > FIRST_RELEASED {
        Refusal::Newer
    } else {
        Refusal::Damaged
    })?;
    let actual = texts(&connection, SCHEMA)?;
    let fresh = Connection::open_in_memory()?;
    schema.at(applied).build(&fresh, None)?;
    if texts(&fresh, SCHEMA)? != actual {
        return Err(Refusal::Damaged);
    }
    if texts(&connection, "PRAGMA integrity_check")? != ["ok"] {
        return Err(Refusal::Damaged);
    }
    Ok(())
}

/// The single text column of every row `sql` returns.
fn texts(connection: &Connection, sql: &str) -> Result<Vec<String>, Refusal> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
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
    use crate::acquisition::tests::filesystem;
    use database::{Reply, Step};
    use rusqlite::types::Value;
    const PAGE: &[u8] = include_bytes!("../tests/fixtures/hsr-api/page.json");
    pub(crate) const UID: &str = "100000002";
    pub(crate) const SERVER: &str = "synthetic-server";
    const SNAPSHOT: &str = "SELECT database_id,revision FROM metadata WHERE singleton=1";
    const TIMEZONE: &str = "SELECT timezone FROM accounts WHERE game=?1 AND uid=?2 AND server=?3";
    const LOOKUP: &str =
        "SELECT payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND id=?4";
    const HISTORY: &str =
        "SELECT id,payload FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 ORDER BY id";
    const SAVED: &str = "SELECT uid,server,id FROM rolls WHERE game=?1";
    const LAST: &str = "SELECT imported_at,adapter,uid,server,inserted FROM batches WHERE game=?1 ORDER BY id DESC LIMIT 1";
    const LATEST: &str = "SELECT b.uid,b.server,a.timezone FROM batches b JOIN accounts a ON a.game=b.game AND a.uid=b.uid AND a.server=b.server WHERE b.game=?1 ORDER BY b.id DESC LIMIT 1";
    const ACCOUNT_LIST: &str = "SELECT a.uid,a.server,a.timezone,count(r.id) FROM accounts a LEFT JOIN rolls r ON r.game=a.game AND r.uid=a.uid AND r.server=a.server WHERE a.game=?1 GROUP BY a.uid,a.server ORDER BY (SELECT max(b.id) FROM batches b WHERE b.game=a.game AND b.uid=a.uid AND b.server=a.server) DESC";
    const TOTALS: &str = "SELECT json_extract(payload,'$.gacha_type'),count(*) FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 GROUP BY 1";
    const ORDER: &str = "SELECT id,json_extract(payload,'$.rank_type'),json_extract(payload,'$.name'),json_extract(payload,'$.time') FROM rolls WHERE game=?1 AND uid=?2 AND server=?3 AND json_extract(payload,'$.gacha_type')=?4 ORDER BY json_extract(payload,'$.time'),length(id),id";
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
    /// The SQL for an account's offset, answered with `value` when it is saved.
    pub(crate) fn timezone(value: Option<Option<i32>>) -> Step {
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
    /// The SQL for looking up a roll's payload, answered with `payload` when found.
    pub(crate) fn lookup(id: &str, payload: Option<&str>) -> Step {
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
    /// A preview of one new fixture record, as a test value.
    pub(crate) fn preview() -> Preview {
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
    /// The SQL that starts opening a database whose version and application ID
    /// read as given.
    fn reading(version: i32, app: i32) -> Vec<Step> {
        let value = |value: i32| vec![vec![Value::Integer(value.into())]];
        vec![
            done("PRAGMA busy_timeout=250; PRAGMA foreign_keys=OFF;"),
            done("BEGIN Immediate"),
            rows("PRAGMA user_version", vec![], value(version)),
            rows("PRAGMA application_id", vec![], value(app)),
        ]
    }
    /// The SQL that creates a new database after reading it: finding it empty, then
    /// the first release's schema.
    fn creating() -> Vec<Step> {
        let mut steps = reading(0, 0);
        steps.push(rows(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            vec![],
            vec![vec![Value::Integer(0)]],
        ));
        steps.push(done(FIRST_SQL));
        steps
    }
    /// The SQL of `migrations` after `from`, each followed by the version it raises.
    fn migrating(from: i32, migrations: &[&str]) -> Vec<Step> {
        (FIRST_RELEASED + 1..)
            .zip(migrations)
            .skip((from - FIRST_RELEASED) as usize)
            .flat_map(|(version, sql)| [done(sql), done(&format!("PRAGMA user_version={version}"))])
            .collect()
    }
    /// The SQL that ends opening a database: its identity read, the transaction
    /// committed, then references enforced.
    fn finishing() -> [Step; 3] {
        [identity(), done("COMMIT"), done("PRAGMA foreign_keys=ON")]
    }
    /// The SQL for initializing a new or existing database after it is opened.
    pub(crate) fn setup(existing: bool) -> Vec<Step> {
        let mut steps = if existing {
            reading(FIRST_RELEASED, APPLICATION_ID)
        } else {
            creating()
        };
        steps.extend(finishing());
        steps
    }
    /// The SQL for opening a database already at `version`, its schema's newest.
    pub(crate) fn opened_at(version: i32) -> Vec<Step> {
        let mut steps = reading(version, APPLICATION_ID);
        steps.extend(finishing());
        steps
    }
    /// The SQL for upgrading a database at `from` through `migrations`, then
    /// finding no broken references.
    fn upgrade(from: i32, migrations: &[&str]) -> Vec<Step> {
        let mut steps = reading(from, APPLICATION_ID);
        steps.extend(migrating(from, migrations));
        steps.push(rows(
            BROKEN_REFERENCES,
            vec![],
            vec![vec![Value::Integer(0)]],
        ));
        steps.extend(finishing());
        steps
    }
    /// `steps` up to the one running `sql`, which fails, then the rollback.
    pub(crate) fn failing_at(mut steps: Vec<Step>, sql: &str) -> Vec<Step> {
        let at = steps.iter().position(|step| step.sql == sql).unwrap();
        steps.truncate(at + 1);
        steps[at].reply = Err(rusqlite::Error::InvalidQuery);
        steps.push(done("ROLLBACK"));
        steps
    }
    /// `steps` up to the one running `sql`, which never runs, then the rollback.
    pub(crate) fn stopping_before(mut steps: Vec<Step>, sql: &str) -> Vec<Step> {
        let at = steps.iter().position(|step| step.sql == sql).unwrap();
        steps.truncate(at);
        steps.push(done("ROLLBACK"));
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
            // Only a failure inside the transaction rolls it back.
            let committed = steps[..index].iter().any(|step| step.sql == "COMMIT");
            if begin.is_some_and(|begin| index > begin) && !committed {
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
    /// The SQL for previewing the fixture page's records for a new account.
    pub(crate) fn preview_script() -> Vec<Step> {
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
    /// The SQL for committing `preview()`, imported at 1234.
    pub(crate) fn commit_script(duplicate: bool) -> Vec<Step> {
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

    /// A test-only migration after the first release's schema.
    pub(crate) const BANNER: &str = "ALTER TABLE rolls ADD COLUMN banner TEXT";
    /// A schema one test-only migration newer than the app's.
    pub(crate) const UPGRADED: Schema = Schema::with_migrations(&[BANNER]);
    /// The SQL for upgrading a database at the first release's version to `UPGRADED`.
    pub(crate) fn upgrading() -> Vec<Step> {
        upgrade(FIRST_RELEASED, &[BANNER])
    }
    #[test]
    fn an_older_release_s_database_is_upgraded_after_it_is_kept() {
        database::expect(upgrading());
        let mut kept = vec![];
        let store = Store::initialize(
            Connection,
            UPGRADED,
            Some(&mut |version| {
                // Nothing has been migrated yet.
                kept.push((version, database::upcoming()));
                Ok(())
            }),
        );
        assert!(store.is_ok());
        database::finish();
        assert_eq!(kept, [(2, Some(BANNER.into()))]);
        // Each failure rolls the whole upgrade back, kept first or not.
        fail_each(&upgrading, Some(1), &mut || {
            Store::initialize(Connection, UPGRADED, None).map(|_| ())
        });
    }
    #[test]
    fn an_upgrade_that_breaks_a_reference_is_rolled_back() {
        let mut steps = reading(FIRST_RELEASED, APPLICATION_ID);
        steps.extend(migrating(FIRST_RELEASED, &[BANNER]));
        steps.extend([
            rows(BROKEN_REFERENCES, vec![], vec![vec![Value::Integer(1)]]),
            done("ROLLBACK"),
        ]);
        database::expect(steps);
        let store = Store::initialize(Connection, UPGRADED, None);
        assert!(matches!(store, Err(Error::Database)));
        database::finish();
    }
    #[test]
    fn a_database_part_way_up_runs_only_the_migrations_after_its_version() {
        let migrations = ["SECOND", "THIRD"];
        database::expect(upgrade(3, &migrations));
        let mut kept = vec![];
        let store = Store::initialize(
            Connection,
            Schema::with_migrations(&["SECOND", "THIRD"]),
            Some(&mut |version| {
                kept.push(version);
                Ok(())
            }),
        );
        assert!(store.is_ok());
        database::finish();
        assert_eq!(kept, [3]);
        // Only the third migration ran, raising the version to 4.
        assert_eq!(
            migrating(3, &migrations)
                .iter()
                .map(|step| step.sql.as_str())
                .collect::<Vec<_>>(),
            ["THIRD", "PRAGMA user_version=4"]
        );
    }
    #[test]
    fn a_failed_keep_stops_the_upgrade_before_anything_changes() {
        database::expect(stopping_before(upgrading(), BANNER));
        let store = Store::initialize(Connection, UPGRADED, Some(&mut |_| Err(Error::Database)));
        assert!(matches!(store, Err(Error::Database)));
        database::finish();
    }
    #[test]
    fn a_new_or_current_database_is_built_or_opened_by_the_same_steps() {
        let mut steps = creating();
        steps.extend(migrating(FIRST_RELEASED, &[BANNER]));
        steps.extend(finishing());
        database::expect(steps);
        let store = Store::initialize(Connection, UPGRADED, None);
        assert!(store.is_ok());
        database::finish();
        // A current database is opened as it is.
        let mut steps = reading(3, APPLICATION_ID);
        steps.extend(finishing());
        database::expect(steps);
        let store = Store::initialize(Connection, UPGRADED, None);
        assert!(store.is_ok());
        database::finish();
    }

    #[test]
    fn initialization_errors_are_safe_and_rollback_after_begin() {
        fail_each(&|| setup(false), Some(1), &mut || {
            Store::initialize(Connection, Schema::CURRENT, None).map(|_| ())
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
        for (version, app) in [
            (3, APPLICATION_ID),
            (2, 0),
            (0, APPLICATION_ID),
            (1, APPLICATION_ID),
        ] {
            let mut steps = reading(version, app);
            steps.push(done("ROLLBACK"));
            database::expect(steps);
            assert!(matches!(
                Store::initialize(Connection, Schema::CURRENT, None),
                Err(Error::Schema)
            ));
            database::finish();
        }
        // An unclaimed database that already holds something isn't taken over.
        let mut steps = reading(0, 0);
        steps.extend([
            rows(
                "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                vec![],
                vec![vec![Value::Integer(1)]],
            ),
            done("ROLLBACK"),
        ]);
        database::expect(steps);
        assert!(matches!(
            Store::initialize(Connection, Schema::CURRENT, None),
            Err(Error::Schema)
        ));
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
            for (id, rarity) in [("1", "5"), ("2", "4"), ("3", "3")] {
                let mut new = list[0].clone();
                new["id"] = serde_json::json!(format!("100000000000000000{id}"));
                new["gacha_type"] = serde_json::json!("1");
                new["time"] = serde_json::json!("2023-01-01 00:00:00");
                new["rank_type"] = serde_json::json!(rarity);
                list.push(new);
            }
        });
        let rolls = parse_response(&bytes).unwrap().list;
        let payload = |index: usize| serde_json::json!(rolls[index]).to_string();
        // The first record is already stored, the second differs from its stored
        // copy, and the rest are new: a 5-star, a 4-star and a 3-star.
        database::expect(vec![
            done("BEGIN Deferred"),
            timezone(None),
            done(&format!("PREPARE {LOOKUP}")),
            lookup(&rolls[0].id, Some(&payload(0))),
            lookup(&rolls[1].id, Some("stored differently")),
            lookup(&rolls[2].id, None),
            lookup(&rolls[3].id, None),
            lookup(&rolls[4].id, None),
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
                "summary": { "inserted": 3, "duplicates": 1, "conflicts": 1 },
                // Only new rows count: the stored and conflicting 5-stars do not.
                "new_five_star": 1,
                "new_four_star": 1,
                "categories": [
                    counts("1", 3, 0, 0), counts("2", 0, 0, 0), counts("11", 0, 1, 1),
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
    /// The SQL for a commit refused because the database is not the previewed one.
    pub(crate) fn stale_commit_script() -> Vec<Step> {
        vec![
            done("BEGIN Immediate"),
            rows(
                SNAPSHOT,
                vec![],
                vec![vec![text("another database"), Value::Integer(1)]],
            ),
            done("ROLLBACK"),
        ]
    }
    #[test]
    fn commit_conflicts_and_stale_previews_do_not_write() {
        let mut conflict = preview();
        conflict.summary.conflicts = 1;
        database::expect(vec![]);
        assert_eq!(store().commit(conflict, 0), Err(Error::Conflict));
        database::finish();
        database::expect(stale_commit_script());
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

    #[test]
    fn the_latest_account_is_the_one_most_recently_imported_into() {
        let latest = |found: Vec<Vec<Value>>| {
            database::expect(vec![latest_step(found)]);
            let account = store().latest_account();
            database::finish();
            account
        };
        assert_eq!(
            latest(vec![vec![text(UID), text(SERVER), Value::Integer(8)]]),
            Ok(Some(Account {
                uid: UID.into(),
                server: SERVER.into(),
                timezone: Some(8),
            }))
        );
        assert_eq!(
            latest(vec![vec![text(UID), text(SERVER), Value::Null]]),
            Ok(Some(Account {
                uid: UID.into(),
                server: SERVER.into(),
                timezone: None,
            }))
        );
        assert_eq!(latest(vec![]), Ok(None));
        for unreadable in [
            vec![Value::Null, text(SERVER), Value::Integer(8)],
            vec![text(UID), Value::Null, Value::Integer(8)],
            vec![text(UID), text(SERVER), text("8")],
        ] {
            assert_eq!(latest(vec![unreadable]), Err(Error::Database));
        }
        fail_each(
            &|| vec![rows(LATEST, vec![text(GAME)], vec![])],
            None,
            &mut || store().latest_account().map(|_| ()),
        );
    }

    #[test]
    fn saved_accounts_list_each_account_with_its_rolls_newest_import_first() {
        let list = |found: Vec<Vec<Value>>| {
            database::expect(accounts_script(found));
            let accounts = store().accounts();
            database::finish();
            accounts
        };
        let found = list(vec![
            accounts_row(),
            vec![
                text("100000003"),
                text(SERVER),
                Value::Null,
                Value::Integer(0),
            ],
        ])
        .unwrap();
        assert_eq!(
            found,
            vec![
                SavedAccount {
                    uid: UID.into(),
                    server: SERVER.into(),
                    timezone: Some(8),
                    rolls: 15,
                },
                SavedAccount {
                    uid: "100000003".into(),
                    server: SERVER.into(),
                    timezone: None,
                    rolls: 0,
                },
            ]
        );
        assert_eq!(
            serde_json::to_value(&found[0]).unwrap(),
            serde_json::json!({ "uid": UID, "server": SERVER, "timezone": 8, "rolls": 15 })
        );
        assert_eq!(list(vec![]), Ok(vec![]));
        for column in 0..4 {
            let mut unreadable = accounts_row();
            unreadable[column] = if column == 2 { text("8") } else { Value::Null };
            assert_eq!(list(vec![unreadable]), Err(Error::Database));
        }
        // A count is never negative, so one is damage.
        let mut negative = accounts_row();
        negative[3] = Value::Integer(-1);
        assert_eq!(list(vec![negative]), Err(Error::InvalidStoredData));
        fail_each(&|| accounts_script(vec![]), None, &mut || {
            store().accounts().map(|_| ())
        });
    }

    #[test]
    fn an_account_is_found_by_uid_and_server_with_its_offset() {
        let find = |value: Option<Option<i32>>| {
            database::expect(vec![timezone(value)]);
            let account = store().account(UID, SERVER);
            database::finish();
            account
        };
        assert_eq!(
            find(Some(Some(8))),
            Ok(Some(Account {
                uid: UID.into(),
                server: SERVER.into(),
                timezone: Some(8),
            }))
        );
        assert_eq!(
            find(Some(None)),
            Ok(Some(Account {
                uid: UID.into(),
                server: SERVER.into(),
                timezone: None,
            }))
        );
        assert_eq!(find(None), Ok(None));
        database::expect(vec![rows(TIMEZONE, scope(), vec![vec![text("8")]])]);
        assert_eq!(store().account(UID, SERVER), Err(Error::Database));
        database::finish();
        fail_each(&|| vec![timezone(None)], None, &mut || {
            store().account(UID, SERVER).map(|_| ())
        });
    }

    /// The SQL for listing the saved accounts, answered with `found`.
    pub(crate) fn accounts_script(found: Vec<Vec<Value>>) -> Vec<Step> {
        vec![
            done(&format!("PREPARE {ACCOUNT_LIST}")),
            rows(ACCOUNT_LIST, vec![text(GAME)], found),
        ]
    }
    /// The fixture account with 15 rolls and its offset.
    pub(crate) fn accounts_row() -> Vec<Value> {
        vec![
            text(UID),
            text(SERVER),
            Value::Integer(8),
            Value::Integer(15),
        ]
    }

    #[test]
    fn the_last_import_is_the_newest_batch_with_where_it_came_from() {
        let last = |found: Vec<Vec<Value>>| {
            database::expect(vec![last_import_step(found)]);
            let last = store().last_import();
            database::finish();
            last
        };
        let found = last(vec![last_import_row()]).unwrap().unwrap();
        assert_eq!(
            found,
            LastImport {
                imported_at: 1_790_000_000,
                source: Source::Hoyoverse,
                uid: UID.into(),
                server: SERVER.into(),
                inserted: 96,
            }
        );
        assert_eq!(
            serde_json::to_value(&found).unwrap(),
            serde_json::json!({
                "imported_at": 1_790_000_000, "source": "hoyoverse", "uid": UID,
                "server": SERVER, "inserted": 96,
            })
        );
        assert_eq!(last(vec![]), Ok(None));
        // Only known adapters write batches, so another is damage.
        let mut unknown = last_import_row();
        unknown[1] = text("uigf-v4");
        assert_eq!(last(vec![unknown]), Err(Error::InvalidStoredData));
        for column in 0..5 {
            let mut unreadable = last_import_row();
            unreadable[column] = Value::Null;
            assert_eq!(last(vec![unreadable]), Err(Error::Database));
        }
        fail_each(&|| vec![last_import_step(vec![])], None, &mut || {
            store().last_import().map(|_| ())
        });
    }

    #[test]
    fn saved_rolls_are_grouped_by_account_for_the_stop_check() {
        let read = |found: Vec<Vec<Value>>| {
            database::expect(saved_rolls_script(found));
            let saved = store().saved_rolls();
            database::finish();
            saved
        };
        let saved = read(vec![
            vec![text(UID), text(SERVER), text("1001")],
            vec![text(UID), text(SERVER), text("1002")],
            vec![text("100000003"), text(SERVER), text("2001")],
            vec![text(UID), text("other-server"), text("3001")],
        ])
        .unwrap();
        let has =
            |uid: &str, server: &str, ids: &[&str]| saved.any(uid, server, ids.iter().copied());
        assert!(has(UID, SERVER, &["9999", "1002"]));
        assert!(!has(UID, SERVER, &["9999", "2001", "3001"]));
        // Another account's or server's rolls never count.
        assert!(has("100000003", SERVER, &["2001"]));
        assert!(!has("100000003", SERVER, &["1001"]));
        assert!(has(UID, "other-server", &["3001"]));
        assert!(!has("100000004", SERVER, &["1001"]));
        assert!(!has(UID, SERVER, &[]));
        // Nothing saved yet.
        let empty = read(vec![]).unwrap();
        assert!(!empty.any(UID, SERVER, ["1001"].into_iter()));
        for column in 0..3 {
            let mut unreadable = vec![text(UID), text(SERVER), text("1001")];
            unreadable[column] = Value::Null;
            assert_eq!(read(vec![unreadable]).map(|_| ()), Err(Error::Database));
        }
        fail_each(&|| saved_rolls_script(vec![]), None, &mut || {
            store().saved_rolls().map(|_| ())
        });
    }

    /// The SQL for reading the saved rolls, answered with `found` (UID, server, ID).
    pub(crate) fn saved_rolls_script(found: Vec<Vec<Value>>) -> Vec<Step> {
        vec![
            done(&format!("PREPARE {SAVED}")),
            rows(SAVED, vec![text(GAME)], found),
        ]
    }

    /// The SQL for finding the last import, answered with `found`.
    pub(crate) fn last_import_step(found: Vec<Vec<Value>>) -> Step {
        rows(LAST, vec![text(GAME)], found)
    }
    /// A retrieval into the fixture account that saved 96 rolls.
    pub(crate) fn last_import_row() -> Vec<Value> {
        vec![
            Value::Integer(1_790_000_000),
            text("hsr-api-v1"),
            text(UID),
            text(SERVER),
            Value::Integer(96),
        ]
    }

    #[test]
    fn the_contents_are_the_accounts_with_their_rolls_and_the_last_import() {
        let script = |accounts: Vec<Vec<Value>>, last: Vec<Vec<Value>>| {
            let mut steps = accounts_script(accounts);
            steps.push(last_import_step(last));
            steps
        };
        database::expect(script(vec![accounts_row()], vec![last_import_row()]));
        assert_eq!(
            store().contents(),
            Ok(Contents {
                accounts: vec![SavedAccount {
                    uid: UID.into(),
                    server: SERVER.into(),
                    timezone: Some(8),
                    rolls: 15,
                }],
                last_import: Some(LastImport {
                    imported_at: 1_790_000_000,
                    source: Source::Hoyoverse,
                    uid: UID.into(),
                    server: SERVER.into(),
                    inserted: 96,
                }),
            })
        );
        database::finish();
        // An empty history holds nothing.
        database::expect(script(vec![], vec![]));
        assert_eq!(store().contents(), Ok(Contents::default()));
        database::finish();
        // Any failing read fails the whole.
        fail_each(
            &|| script(vec![accounts_row()], vec![last_import_row()]),
            None,
            &mut || store().contents().map(|_| ()),
        );
    }

    /// The SQL for finding the latest account, answered with `found`.
    pub(crate) fn latest_step(found: Vec<Vec<Value>>) -> Step {
        rows(LATEST, vec![text(GAME)], found)
    }
    /// The latest account as the fixture's: its UID, server and offset.
    pub(crate) fn latest_row() -> Vec<Value> {
        vec![text(UID), text(SERVER), Value::Integer(8)]
    }
    /// The fixture account's 5 Character Event Warp rolls, oldest first: ID,
    /// rarity, name and time. The fixture page's two 5★ rolls are numbers 2 and 3.
    const CATEGORY: [(&str, &str, &str, &str); 5] = [
        ("9007199254740989", "3", "Arrows", "2024-01-01 00:00:00"),
        (
            "9007199254740992",
            "5",
            "Synthetic item",
            "2024-02-29 12:34:56",
        ),
        (
            "9007199254740993",
            "5",
            "Synthetic item",
            "2024-02-29 12:34:56",
        ),
        ("9007199254740994", "4", "Pela", "2024-03-01 09:00:00"),
        ("9007199254740995", "4", "Éclair", "2024-03-02 10:00:00"),
    ];
    /// The stored payload of the category's roll with this ID.
    pub(crate) fn payload(id: &str) -> String {
        let (_, rank, name, time) = CATEGORY.iter().find(|(each, ..)| *each == id).unwrap();
        let mut roll = parse_response(PAGE).unwrap().list.remove(0);
        roll.id = id.into();
        roll.rank_type = (*rank).into();
        roll.name = (*name).into();
        roll.time = (*time).into();
        serde_json::json!(roll).to_string()
    }
    /// Lookups that find each of these rolls' payloads, in this order.
    pub(crate) fn found(ids: &[&str]) -> Vec<Step> {
        ids.iter()
            .map(|id| lookup(id, Some(&payload(id))))
            .collect()
    }
    /// The SQL for a Character Event Warp page of the fixture account, which also
    /// holds 3 Stellar Warp rolls: its counts and rolls in order, then `lookups` of
    /// the rolls shown.
    pub(crate) fn page_script(lookups: Vec<Step>) -> Vec<Step> {
        let mut steps = category_script(
            vec![
                vec![text("1"), Value::Integer(3)],
                vec![text("11"), Value::Integer(5)],
            ],
            CATEGORY
                .iter()
                .map(|(id, rank, name, time)| vec![text(id), text(rank), text(name), text(time)])
                .collect(),
        );
        steps.extend(lookups);
        steps
    }
    fn category_scope() -> Vec<Value> {
        let mut bindings = scope();
        bindings.push(text("11"));
        bindings
    }
    /// The SQL up to the account's counts, for reads that stop there.
    fn counting_script(totals: Vec<Vec<Value>>) -> Vec<Step> {
        let mut steps = category_script(totals, vec![]);
        steps.truncate(2);
        steps
    }
    /// The SQL for a Character Event Warp page before any lookup: the account's
    /// counts per category and the category's rolls in order.
    fn category_script(totals: Vec<Vec<Value>>, order: Vec<Vec<Value>>) -> Vec<Step> {
        vec![
            done(&format!("PREPARE {TOTALS}")),
            rows(TOTALS, scope(), totals),
            done(&format!("PREPARE {ORDER}")),
            rows(ORDER, category_scope(), order),
            done(&format!("PREPARE {LOOKUP}")),
        ]
    }
    /// Every category's count, in `Category::ALL` order, from `(code, count)` pairs.
    fn totals(counts: &[(&'static str, usize)]) -> Vec<CategoryTotal> {
        Category::ALL
            .into_iter()
            .map(|category| CategoryTotal {
                gacha_type: category.code(),
                total: counts
                    .iter()
                    .find(|(code, _)| *code == category.code())
                    .map_or(0, |(_, count)| *count),
            })
            .collect()
    }
    /// The fixture page's rolls as stored rows: ID and payload.
    pub(crate) fn page_rows() -> Vec<Vec<Value>> {
        parse_response(PAGE)
            .unwrap()
            .list
            .iter()
            .map(|roll| vec![text(&roll.id), text(&serde_json::json!(roll).to_string())])
            .collect()
    }
    fn read(filter: &Filter, offset: usize, limit: usize) -> Result<HistoryPage, Error> {
        store().page(UID, SERVER, Category::CharacterEvent, filter, offset, limit)
    }
    fn showing(five: bool, four: bool, three: bool, name: &str) -> Filter {
        Filter {
            rarities: Rarities { five, four, three },
            name: name.into(),
            ..Filter::default()
        }
    }
    fn dated(from: Option<&str>, to: Option<&str>) -> Filter {
        Filter {
            from: from.map(String::from),
            to: to.map(String::from),
            ..Filter::default()
        }
    }

    #[test]
    fn a_page_lists_one_category_newest_first_numbered_in_it() {
        database::expect(page_script(found(&[
            "9007199254740993",
            "9007199254740992",
        ])));
        let page = read(&Filter::default(), 2, 2).unwrap();
        database::finish();
        // Oldest first the category runs 3★ 5★ 5★ 4★ 4★, so its pity counts run
        // 1, 2 (a 5★ at pity 2), 1 (straight after it), then 1, 2.
        let roll = |number, pity, id: &str| StoredRoll {
            number,
            pity,
            id: id.into(),
            name: "Synthetic item".into(),
            item_type: "Synthetic category".into(),
            rank_type: "5".into(),
            time: "2024-02-29 12:34:56".into(),
        };
        assert_eq!(
            page,
            HistoryPage {
                total: 5,
                matched: 5,
                soft_pity: Some(SoftPity { near: 49, soft: 74 }),
                categories: totals(&[("1", 3), ("11", 5)]),
                summary: CategorySummary {
                    five_star: 2,
                    four_star: 2,
                    first: Some("2024-01-01 00:00:00".into()),
                    last: Some("2024-03-02 10:00:00".into()),
                },
                rolls: vec![
                    roll(3, 1, "9007199254740993"),
                    roll(2, 2, "9007199254740992")
                ],
            }
        );
        assert_eq!(
            serde_json::to_value(&page.summary).unwrap(),
            serde_json::json!({
                "five_star": 2, "four_star": 2,
                "first": "2024-01-01 00:00:00", "last": "2024-03-02 10:00:00",
            })
        );
        assert_eq!(
            serde_json::to_value(&page.categories[0]).unwrap(),
            serde_json::json!({ "gacha_type": "1", "total": 3 })
        );
        assert_eq!(
            serde_json::to_value(&page.rolls[0]).unwrap(),
            serde_json::json!({
                "number": 3, "pity": 1, "id": "9007199254740993", "name": "Synthetic item",
                "item_type": "Synthetic category", "rank_type": "5",
                "time": "2024-02-29 12:34:56",
            })
        );
        assert_eq!(serde_json::to_value(&page).unwrap()["matched"], 5);
        assert_eq!(
            serde_json::to_value(&page).unwrap()["soft_pity"],
            serde_json::json!({ "near": 49, "soft": 74 })
        );
        // A page past the end shows nothing, looking nothing up.
        database::expect(page_script(vec![]));
        assert_eq!(read(&Filter::default(), 5, 20).unwrap().rolls, vec![]);
        database::finish();
    }

    #[test]
    fn an_empty_category_still_lists_the_other_categories_counts() {
        database::expect(category_script(
            vec![vec![text("22"), Value::Integer(7)]],
            vec![],
        ));
        let page = read(&Filter::default(), 0, 20).unwrap();
        database::finish();
        assert_eq!(
            page,
            HistoryPage {
                total: 0,
                matched: 0,
                soft_pity: Some(SoftPity { near: 49, soft: 74 }),
                categories: totals(&[("22", 7)]),
                summary: CategorySummary::default(),
                rolls: vec![],
            }
        );
        assert_eq!(
            serde_json::to_value(CategorySummary::default()).unwrap(),
            serde_json::json!({ "five_star": 0, "four_star": 0, "first": null, "last": null })
        );
        assert_eq!(
            HistoryPage::empty(),
            HistoryPage {
                total: 0,
                matched: 0,
                soft_pity: None,
                categories: totals(&[]),
                summary: CategorySummary::default(),
                rolls: vec![],
            }
        );
    }

    #[test]
    fn counts_of_an_unknown_category_are_damage() {
        database::expect(counting_script(vec![vec![text("99"), Value::Integer(1)]]));
        assert_eq!(
            read(&Filter::default(), 0, 20),
            Err(Error::InvalidStoredData)
        );
        database::finish();
    }

    #[test]
    fn page_query_and_row_failures_are_safe() {
        fail_each(
            &|| page_script(found(&["9007199254740993", "9007199254740992"])),
            None,
            &mut || read(&Filter::default(), 2, 2).map(|_| ()),
        );
        for unreadable in [
            vec![Value::Null, Value::Integer(1)],
            vec![text("11"), text("1")],
        ] {
            database::expect(counting_script(vec![unreadable]));
            assert_eq!(read(&Filter::default(), 0, 20), Err(Error::Database));
            database::finish();
        }
        // Each ordered roll needs its ID, rarity, name and time.
        for column in 0..4 {
            let mut ordered = vec![
                text("9007199254740989"),
                text("3"),
                text("Arrows"),
                text("2024-01-01 00:00:00"),
            ];
            ordered[column] = Value::Null;
            let mut steps = page_script(vec![]);
            steps[3] = rows(ORDER, category_scope(), vec![ordered]);
            steps.truncate(4);
            database::expect(steps);
            assert_eq!(read(&Filter::default(), 0, 20), Err(Error::Database));
            database::finish();
        }
        // A roll that can't be looked up again is a database failure.
        database::expect(page_script(vec![lookup("9007199254740995", None)]));
        assert_eq!(read(&Filter::default(), 0, 20), Err(Error::Database));
        database::finish();
    }

    #[test]
    fn an_ordered_roll_of_an_unknown_rarity_is_damage() {
        let mut steps = page_script(vec![]);
        steps[3] = rows(
            ORDER,
            category_scope(),
            vec![vec![
                text("9007199254740989"),
                text("6"),
                text("Arrows"),
                text("2024-01-01 00:00:00"),
            ]],
        );
        steps.truncate(4);
        database::expect(steps);
        assert_eq!(
            read(&Filter::default(), 0, 20),
            Err(Error::InvalidStoredData)
        );
        database::finish();
    }

    #[test]
    fn a_filtered_page_shows_the_chosen_rarities_keeping_category_numbers() {
        database::expect(page_script(found(&[
            "9007199254740993",
            "9007199254740992",
        ])));
        let page = read(&showing(true, false, false, ""), 0, 20).unwrap();
        database::finish();
        // The tabs and strip still count the whole category; paging counts what matches.
        let whole = CategorySummary {
            five_star: 2,
            four_star: 2,
            first: Some("2024-01-01 00:00:00".into()),
            last: Some("2024-03-02 10:00:00".into()),
        };
        assert_eq!((page.total, page.matched), (5, 2));
        assert_eq!(page.summary, whole);
        let numbers = |page: &HistoryPage| -> Vec<usize> {
            page.rolls.iter().map(|roll| roll.number).collect()
        };
        assert_eq!(numbers(&page), [3, 2]);
        // 4★ and 3★ rolls match 3 of the 5, newest first; nothing matches none.
        database::expect(page_script(found(&[
            "9007199254740995",
            "9007199254740994",
            "9007199254740989",
        ])));
        let page = read(&showing(false, true, true, ""), 0, 20).unwrap();
        database::finish();
        assert_eq!((page.matched, numbers(&page)), (3, vec![5, 4, 1]));
        // Hidden rolls still count towards pity: the 4★ after the hidden 5★ starts again.
        let pity: Vec<usize> = page.rolls.iter().map(|roll| roll.pity).collect();
        assert_eq!(pity, [2, 1, 1]);
        // A search leaves the summary whole too.
        database::expect(page_script(found(&["9007199254740989"])));
        let page = read(&showing(true, true, true, "arrows"), 0, 20).unwrap();
        database::finish();
        assert_eq!((page.matched, page.summary), (1, whole));
        database::expect(page_script(vec![]));
        assert_eq!(
            read(&showing(false, false, false, ""), 0, 20)
                .unwrap()
                .matched,
            0
        );
        database::finish();
    }

    #[test]
    fn a_name_search_ignores_case_and_surrounding_spaces_with_the_rarities_shown() {
        let search = |filter: Filter, ids: &[&str]| {
            database::expect(page_script(found(ids)));
            let page = read(&filter, 0, 20).unwrap();
            database::finish();
            let numbers: Vec<usize> = page.rolls.iter().map(|roll| roll.number).collect();
            (page.total, page.matched, numbers)
        };
        assert_eq!(
            search(
                showing(true, true, true, "SYNTHETIC"),
                &["9007199254740993", "9007199254740992"]
            ),
            (5, 2, vec![3, 2])
        );
        // Case folds beyond ASCII, and the search is trimmed.
        assert_eq!(
            search(
                showing(true, true, true, "  éCLAIR "),
                &["9007199254740995"]
            ),
            (5, 1, vec![5])
        );
        // Parts of names match; the rarities shown still apply.
        assert_eq!(
            search(showing(true, false, true, "r"), &["9007199254740989"]),
            (5, 1, vec![1])
        );
        assert_eq!(
            search(showing(true, true, true, "kafka"), &[]),
            (5, 0, vec![])
        );
    }

    #[test]
    fn a_date_range_keeps_rolls_on_and_between_its_days_in_server_time() {
        let read_dated = |filter: Filter, ids: &[&str]| {
            database::expect(page_script(found(ids)));
            let page = read(&filter, 0, 20).unwrap();
            database::finish();
            let numbers: Vec<usize> = page.rolls.iter().map(|roll| roll.number).collect();
            (page.matched, numbers, page.summary.first)
        };
        let first = || Some("2024-01-01 00:00:00".to_owned());
        // Both ends are whole days, so 29 Feb to 1 Mar keeps 12:34:56 and 09:00:00.
        assert_eq!(
            read_dated(
                dated(Some("2024-02-29"), Some("2024-03-01")),
                &["9007199254740994", "9007199254740993", "9007199254740992"]
            ),
            (3, vec![4, 3, 2], first())
        );
        // Either end may be open.
        assert_eq!(
            read_dated(
                dated(Some("2024-03-01"), None),
                &["9007199254740995", "9007199254740994"]
            ),
            (2, vec![5, 4], first())
        );
        assert_eq!(
            read_dated(dated(None, Some("2024-01-01")), &["9007199254740989"]),
            (1, vec![1], first())
        );
        // A range that ends before it starts keeps nothing.
        assert_eq!(
            read_dated(dated(Some("2024-03-02"), Some("2024-01-01")), &[]),
            (0, vec![], first())
        );
    }

    #[test]
    fn names_match_ignoring_case_in_any_script() {
        for (name, search) in [
            ("Кафка", "кАФ"),
            ("Éclair", "ÉCL"),
            ("Pela", ""),
            ("Ärger", "äRGER"),
        ] {
            assert!(Filter::matches_name(name, &fold(search)), "{name} {search}");
        }
        assert!(!Filter::matches_name("Pela", &fold("kafka")));
    }

    #[test]
    fn a_page_rejects_corrupt_rows_and_rows_of_another_category() {
        let mut other = parse_response(PAGE).unwrap().list.remove(0);
        other.gacha_type = "1".into();
        let other = serde_json::json!(other).to_string();
        for corrupt in [other.as_str(), "{"] {
            database::expect(page_script(vec![lookup("9007199254740993", Some(corrupt))]));
            assert_eq!(
                read(&Filter::default(), 2, 2),
                Err(Error::InvalidStoredData)
            );
            database::finish();
        }
    }

    pub(crate) const VACUUM: &str = "VACUUM INTO ?1";
    /// `steps` up to and including the first running `sql`, which answers `reply`
    /// instead and is the last step reached.
    pub(crate) fn ending_at(
        mut steps: Vec<Step>,
        sql: &str,
        reply: rusqlite::Result<Reply>,
    ) -> Vec<Step> {
        let at = steps.iter().position(|step| step.sql == sql).unwrap();
        steps.truncate(at + 1);
        steps[at].reply = reply;
        steps
    }
    /// A schema row as the check reads it from `sqlite_schema`.
    fn object(name: &str, sql: &str) -> Vec<Value> {
        vec![text(
            &serde_json::json!(["table", name, name, sql]).to_string(),
        )]
    }
    /// The SQL for checking `path`, answered as a released, intact database whose
    /// schema matches: opened read-only with its schema distrusted and SQLite's
    /// limits lowered, then compared with its version's schema before its integrity
    /// check.
    pub(crate) fn check_script(path: &str) -> Vec<Step> {
        use rusqlite::{config::DbConfig, limits::Limit};
        let schema = vec![object("accounts", "CREATE TABLE accounts")];
        let config = |config: DbConfig, on: bool| {
            let bindings = vec![Value::Integer(config as i64), Value::Integer(on.into())];
            step("DB CONFIG", bindings, Reply::Done)
        };
        let limit = |limit: Limit, value: i64| {
            let bindings = vec![Value::Integer(limit as i64), Value::Integer(value)];
            step("LIMIT", bindings, Reply::Done)
        };
        vec![
            step(
                "OPEN WITH FLAGS",
                vec![
                    text(path),
                    Value::Integer(rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY.bits().into()),
                ],
                Reply::Done,
            ),
            config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true),
            config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false),
            limit(Limit::SQLITE_LIMIT_LENGTH, 1_000_000),
            limit(Limit::SQLITE_LIMIT_SQL_LENGTH, 100_000),
            limit(Limit::SQLITE_LIMIT_COLUMN, 100),
            limit(Limit::SQLITE_LIMIT_EXPR_DEPTH, 10),
            limit(Limit::SQLITE_LIMIT_COMPOUND_SELECT, 3),
            limit(Limit::SQLITE_LIMIT_VDBE_OP, 25_000),
            limit(Limit::SQLITE_LIMIT_FUNCTION_ARG, 8),
            limit(Limit::SQLITE_LIMIT_ATTACHED, 0),
            limit(Limit::SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 50),
            limit(Limit::SQLITE_LIMIT_VARIABLE_NUMBER, 10),
            limit(Limit::SQLITE_LIMIT_TRIGGER_DEPTH, 10),
            done("PRAGMA mmap_size=0; PRAGMA cell_size_check=ON;"),
            rows("PRAGMA page_count", vec![], vec![vec![Value::Integer(4)]]),
            rows(
                "PRAGMA application_id",
                vec![],
                vec![vec![Value::Integer(APPLICATION_ID.into())]],
            ),
            rows("PRAGMA user_version", vec![], vec![vec![Value::Integer(2)]]),
            done(&format!("PREPARE {SCHEMA}")),
            rows(SCHEMA, vec![], schema.clone()),
            step("OPEN IN MEMORY", vec![], Reply::Done),
            done(include_str!("../migrations/001_initial.sql")),
            done(&format!("PREPARE {SCHEMA}")),
            rows(SCHEMA, vec![], schema),
            done("PREPARE PRAGMA integrity_check"),
            rows("PRAGMA integrity_check", vec![], vec![vec![text("ok")]]),
        ]
    }
    /// A file system holding the checked file, `length` bytes long.
    fn holding(length: u64) {
        let path = std::path::PathBuf::from("backup.sqlite");
        filesystem::install(filesystem::Fixture {
            files: [(path.clone(), vec![])].into(),
            lengths: [(path, length)].into(),
            ..Default::default()
        });
    }
    fn check() -> Result<(), Refusal> {
        check_database(Path::new("backup.sqlite"), Schema::CURRENT)
    }
    /// A failure SQLite reports with `code`.
    fn sqlite(code: std::ffi::c_int) -> rusqlite::Error {
        rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(code), None)
    }

    #[test]
    fn a_snapshot_is_written_with_vacuum_into_the_given_path() {
        database::expect(vec![step(
            VACUUM,
            vec![text("backup.sqlite.partial")],
            Reply::Count(0),
        )]);
        assert_eq!(
            store().write_snapshot(Path::new("backup.sqlite.partial")),
            Ok(())
        );
        database::finish();
        let mut failing = step(VACUUM, vec![text("backup.sqlite.partial")], Reply::Count(0));
        failing.reply = Err(rusqlite::Error::InvalidQuery);
        database::expect(vec![failing]);
        assert_eq!(
            store().write_snapshot(Path::new("backup.sqlite.partial")),
            Err(Error::Database)
        );
        database::finish();
        // A path that is not UTF-8 is refused before any SQL.
        database::expect(vec![]);
        assert_eq!(store().write_snapshot(&not_utf8()), Err(Error::Database));
        database::finish();
    }
    /// A path SQLite could not be given as text.
    #[cfg(unix)]
    fn not_utf8() -> std::path::PathBuf {
        use std::os::unix::ffi::OsStrExt;
        std::path::PathBuf::from(std::ffi::OsStr::from_bytes(b"backup-\xff.sqlite"))
    }
    #[cfg(windows)]
    fn not_utf8() -> std::path::PathBuf {
        use std::os::windows::ffi::OsStringExt;
        std::path::PathBuf::from(std::ffi::OsString::from_wide(&[0x62, 0xD800, 0x62]))
    }

    #[test]
    fn a_released_intact_database_of_this_app_passes_its_check() {
        holding(4096);
        database::expect(check_script("backup.sqlite"));
        assert_eq!(check(), Ok(()));
        database::finish();
        // The bound is inclusive.
        holding(MAX_DATABASE_BYTES);
        database::expect(check_script("backup.sqlite"));
        assert_eq!(check(), Ok(()));
        database::finish();
    }

    #[test]
    fn a_file_too_large_or_unreadable_is_refused_before_it_is_opened() {
        assert_eq!(MAX_DATABASE_BYTES, 256 * 1024 * 1024);
        holding(MAX_DATABASE_BYTES + 1);
        database::expect(vec![]);
        assert_eq!(check(), Err(Refusal::TooLarge));
        database::finish();
        // A file whose size cannot be read is never opened either.
        filesystem::install(filesystem::Fixture::default());
        assert_eq!(check(), Err(Refusal::Unreadable));
        database::finish();
    }

    #[test]
    fn each_failing_step_says_whether_the_file_is_damaged_or_not_a_database() {
        for (code, refusal) in [
            (rusqlite::ffi::SQLITE_NOTADB, Refusal::NotDatabase),
            (rusqlite::ffi::SQLITE_CORRUPT, Refusal::Damaged),
            (rusqlite::ffi::SQLITE_TOOBIG, Refusal::Damaged),
            (rusqlite::ffi::SQLITE_IOERR, Refusal::Unreadable),
        ] {
            for index in 0..check_script("backup.sqlite").len() {
                let mut steps = check_script("backup.sqlite");
                steps.truncate(index + 1);
                steps[index].reply = Err(sqlite(code));
                holding(4096);
                database::expect(steps);
                assert_eq!(check(), Err(refusal), "step {index}, code {code}");
                database::finish();
            }
        }
        // Errors without a SQLite code, such as an unreadable row, are unreadable.
        for sql in [SCHEMA, "PRAGMA integrity_check"] {
            let unreadable = Reply::Rows(vec![Err(rusqlite::Error::InvalidQuery)]);
            holding(4096);
            database::expect(check_ending_at(sql, unreadable));
            assert_eq!(check(), Err(Refusal::Unreadable), "{sql}");
            database::finish();
        }
    }

    /// The check's steps up to the first running `sql`, which answers `reply`.
    fn check_ending_at(sql: &str, reply: Reply) -> Vec<Step> {
        ending_at(check_script("backup.sqlite"), sql, Ok(reply))
    }
    fn integer(value: i64) -> Reply {
        Reply::Rows(vec![Ok(vec![Value::Integer(value)])])
    }

    #[test]
    fn an_empty_file_is_not_a_database() {
        holding(0);
        database::expect(check_ending_at("PRAGMA page_count", integer(0)));
        assert_eq!(check(), Err(Refusal::NotDatabase));
        database::finish();
    }

    #[test]
    fn another_apps_newer_or_unreleased_database_is_refused_as_such() {
        for app in [0, APPLICATION_ID + 1] {
            holding(4096);
            database::expect(check_ending_at(
                "PRAGMA application_id",
                integer(app.into()),
            ));
            assert_eq!(check(), Err(Refusal::OtherApp), "application ID {app}");
            database::finish();
        }
        // 3 is newer than this app; version 1 was a pre-release layout, and 0 was
        // never written with this app's ID, so neither can be trusted.
        for (version, refusal) in [
            (3, Refusal::Newer),
            (1, Refusal::Damaged),
            (0, Refusal::Damaged),
        ] {
            holding(4096);
            database::expect(check_ending_at("PRAGMA user_version", integer(version)));
            assert_eq!(check(), Err(refusal), "version {version}");
            database::finish();
        }
    }

    #[test]
    fn a_failed_integrity_check_is_damage() {
        for report in [
            vec![vec![text("*** in database main ***")]],
            vec![vec![text("ok")], vec![text("ok")]],
            vec![],
        ] {
            let report = Reply::Rows(report.into_iter().map(Ok).collect());
            holding(4096);
            database::expect(check_ending_at("PRAGMA integrity_check", report));
            assert_eq!(check(), Err(Refusal::Damaged));
            database::finish();
        }
    }

    #[test]
    fn a_schema_unlike_its_versions_is_damage_found_before_the_integrity_check() {
        for actual in [
            vec![
                object("accounts", "CREATE TABLE accounts"),
                object("extra", "CREATE TABLE extra"),
            ],
            vec![object("accounts", "CREATE TABLE accounts (changed)")],
            vec![],
        ] {
            // The file's schema is read first, then the fresh database's; the
            // integrity check, which would run the file's schema, never runs.
            let mut steps = check_script("backup.sqlite");
            let file = steps.iter().position(|step| step.sql == SCHEMA).unwrap();
            steps[file] = rows(SCHEMA, vec![], actual);
            let integrity = steps
                .iter()
                .position(|step| step.sql == "PREPARE PRAGMA integrity_check")
                .unwrap();
            steps.truncate(integrity);
            holding(4096);
            database::expect(steps);
            assert_eq!(check(), Err(Refusal::Damaged));
            database::finish();
        }
    }
}
