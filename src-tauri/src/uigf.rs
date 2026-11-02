//! UIGF history files: detection, validation and normalisation of their Star Rail
//! accounts into rolls; no filesystem, network, or persistence access.

use crate::hsr::{self, Roll};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap};

/// Bound for one history file: enough for at least 100,000 rolls.
pub const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;

/// The account languages UIGF allows.
const LANGUAGES: [&str; 15] = [
    "de-de", "en-us", "es-es", "fr-fr", "id-id", "it-it", "ja-jp", "ko-kr", "pt-pt", "ru-ru",
    "th-th", "tr-tr", "vi-vn", "zh-cn", "zh-tw",
];
/// Other games' sections, reported and not read.
const OTHER_GAMES: [&str; 3] = ["hk4e", "nap", "hk4e_ugc"];
/// The fields a Star Rail record needs: UIGF's, then a name, item type and rarity.
const REQUIRED: [&str; 8] = [
    "id",
    "gacha_type",
    "gacha_id",
    "item_id",
    "time",
    "name",
    "item_type",
    "rank_type",
];
/// The other fields a roll reads. Like the required ones, they must be text.
const OPTIONAL: [&str; 3] = ["count", "uid", "lang"];
/// The categories UIGF added in v4.1.
const NEWER_CATEGORIES: [&str; 2] = ["21", "22"];

/// Why a whole file is refused, without its contents.
#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    TooLarge,
    /// Not JSON, or ambiguous JSON such as a repeated member.
    NotJson,
    /// JSON, but not a UIGF file this reader can trust.
    NotUigf,
    /// A history format or version other than UIGF v4.0 to v4.2.
    Unsupported(Found),
}

/// The unsupported format a file declares.
#[derive(Debug, PartialEq, Eq)]
pub enum Found {
    Version {
        major: u64,
        minor: u64,
    },
    /// UIGF up to v3.0, which declares `uigf_version`.
    LegacyUigf,
    /// SRGF, Star Rail's format before UIGF v4.0.
    Srgf,
}

/// A file's Star Rail accounts, and what was left out.
#[derive(Debug, PartialEq, Eq)]
pub struct File {
    pub accounts: Vec<Account>,
    /// Star Rail accounts whose UID is not digits, counted rather than shown.
    pub malformed_uids: usize,
    /// Other games' sections, which are not read.
    pub other_games: Vec<&'static str>,
}

/// One Star Rail account in a file. Holds player data: never log or display it.
#[derive(PartialEq, Eq)]
pub struct Account {
    pub uid: String,
    pub history: Result<History, Problem>,
}
impl std::fmt::Debug for Account {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Account([redacted])")
    }
}

/// An importable account's offset and rolls, in file order.
#[derive(PartialEq, Eq)]
pub struct History {
    pub timezone: i32,
    pub rolls: Vec<Roll>,
}
impl std::fmt::Debug for History {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("History([redacted])")
    }
}

/// Why an account cannot be imported.
#[derive(Debug, PartialEq, Eq)]
pub enum Problem {
    /// The file holds the UID more than once.
    Repeated,
    /// The time zone is not a real UTC offset in whole hours.
    InvalidTimezone,
    /// The account holds no records.
    NoRolls,
    RecordFaults(RecordFaults),
}

/// How many of an account's records fail, and how.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RecordFaults {
    /// RecordFaults lacking each field a Star Rail roll needs.
    pub missing: BTreeMap<&'static str, usize>,
    /// RecordFaults with a field of the wrong type or value.
    pub invalid: usize,
    /// RecordFaults of categories 21 and 22 in a file older than v4.1, which added them.
    pub newer_categories: usize,
}

/// Read a UIGF file's Star Rail accounts. A file that is not valid UIGF v4.0 to
/// v4.2 is refused whole; an account that cannot be imported says why.
pub fn read(bytes: &[u8]) -> Result<File, Error> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(Error::TooLarge);
    }
    crate::validate_json(bytes).map_err(|_| Error::NotJson)?;
    let root: Map<String, Value> = serde_json::from_slice(bytes).map_err(|_| Error::NotUigf)?;
    let minor = version(root.get("info"))?;
    let sources = match root.get("hkrpg") {
        None => Vec::new(),
        Some(Value::Array(accounts)) => accounts
            .iter()
            .map(Source::read)
            .collect::<Option<Vec<_>>>()
            .ok_or(Error::NotUigf)?,
        Some(_) => return Err(Error::NotUigf),
    };
    let malformed_uids = sources.iter().filter(|source| source.uid.is_none()).count();
    let mut copies: HashMap<&str, usize> = HashMap::new();
    for uid in sources.iter().filter_map(|source| source.uid.as_deref()) {
        *copies.entry(uid).or_default() += 1;
    }
    let accounts = sources
        .iter()
        .filter_map(|source| {
            let uid = source.uid.clone()?;
            let repeated = copies[uid.as_str()] > 1;
            let history = if repeated {
                Err(Problem::Repeated)
            } else {
                source.history(&uid, minor)
            };
            Some(Account { uid, history })
        })
        .collect();
    Ok(File {
        accounts,
        malformed_uids,
        other_games: OTHER_GAMES
            .into_iter()
            .filter(|game| root.contains_key(*game))
            .collect(),
    })
}

/// The file's UIGF v4 minor version, or why the file is refused.
fn version(info: Option<&Value>) -> Result<u64, Error> {
    let info = info.and_then(Value::as_object).ok_or(Error::NotUigf)?;
    let Some(version) = info.get("version") else {
        return Err(if info.contains_key("srgf_version") {
            Error::Unsupported(Found::Srgf)
        } else if info.contains_key("uigf_version") {
            Error::Unsupported(Found::LegacyUigf)
        } else {
            Error::NotUigf
        });
    };
    // The other fields UIGF requires.
    let exported = info
        .get("export_timestamp")
        .is_some_and(|stamp| stamp.is_string() || integer(stamp));
    let app = ["export_app", "export_app_version"]
        .iter()
        .all(|field| info.get(*field).is_some_and(Value::is_string));
    if !(exported && app) {
        return Err(Error::NotUigf);
    }
    let (major, minor) = version
        .as_str()
        .and_then(|version| version.strip_prefix('v'))
        .and_then(|version| version.split_once('.'))
        .filter(|(major, minor)| hsr::digits(major) && hsr::digits(minor))
        .and_then(|(major, minor)| Some((major.parse().ok()?, minor.parse().ok()?)))
        .ok_or(Error::NotUigf)?;
    if major != 4 || minor > 2 {
        return Err(Error::Unsupported(Found::Version { major, minor }));
    }
    Ok(minor)
}

/// Whether `value` is a JSON integer as written, not a fraction or exponent.
fn integer(value: &Value) -> bool {
    value.as_i64().is_some() || value.as_u64().is_some()
}

/// One `hkrpg` account as the file gives it.
struct Source<'a> {
    /// The UID as text, or `None` when it is not digits.
    uid: Option<String>,
    timezone: i64,
    lang: Option<&'a str>,
    list: &'a [Value],
}
impl<'a> Source<'a> {
    /// The account, or `None` when its structure is not UIGF's.
    fn read(value: &'a Value) -> Option<Self> {
        let account = value.as_object()?;
        let uid = match account.get("uid")? {
            Value::String(uid) => Some(uid.clone()).filter(|uid| hsr::digits(uid)),
            Value::Number(uid) => match uid.as_u64() {
                Some(uid) => Some(uid.to_string()),
                // A negative integer is UIGF's, but not a UID; anything else is not.
                None => {
                    uid.as_i64()?;
                    None
                }
            },
            _ => return None,
        };
        let timezone = account.get("timezone")?.as_i64()?;
        let lang = match account.get("lang") {
            None => None,
            Some(Value::String(lang)) if LANGUAGES.contains(&lang.as_str()) => Some(lang.as_str()),
            Some(_) => return None,
        };
        let list = account.get("list")?.as_array()?;
        list.iter().all(Value::is_object).then_some(Self {
            uid,
            timezone,
            lang,
            list,
        })
    }

    /// The account's history, or why it cannot be imported.
    fn history(&self, uid: &str, minor: u64) -> Result<History, Problem> {
        let timezone = i32::try_from(self.timezone)
            .ok()
            .filter(|offset| hsr::valid_offset(*offset))
            .ok_or(Problem::InvalidTimezone)?;
        if self.list.is_empty() {
            return Err(Problem::NoRolls);
        }
        let mut problems = RecordFaults::default();
        let mut rolls = Vec::new();
        for record in self.list.iter().filter_map(Value::as_object) {
            let missing: Vec<_> = REQUIRED
                .into_iter()
                .filter(|field| !record.contains_key(*field))
                .collect();
            if !missing.is_empty() {
                for field in missing {
                    *problems.missing.entry(field).or_default() += 1;
                }
                continue;
            }
            match roll(record, uid, self.lang) {
                None => problems.invalid += 1,
                Some(roll)
                    if minor == 0 && NEWER_CATEGORIES.contains(&roll.gacha_type.as_str()) =>
                {
                    problems.newer_categories += 1;
                }
                Some(roll) => rolls.push(roll),
            }
        }
        if problems == RecordFaults::default() {
            Ok(History { timezone, rolls })
        } else {
            Err(Problem::RecordFaults(problems))
        }
    }
}

/// A record as a roll of account `uid`, as retrieval would give it, or `None`
/// when a field is invalid. A record without a language takes the account's, and
/// a pool ID repeating the roll's category, as some exporters write, is dropped.
fn roll(record: &Map<String, Value>, uid: &str, lang: Option<&str>) -> Option<Roll> {
    if REQUIRED
        .iter()
        .chain(&OPTIONAL)
        .any(|field| record.get(*field).is_some_and(|value| !value.is_string()))
    {
        return None;
    }
    if record.get("uid").is_some_and(|own| own != uid) {
        return None;
    }
    let mut record = record.clone();
    record.insert("uid".into(), uid.into());
    if let Some(lang) = lang {
        record.entry("lang").or_insert_with(|| lang.into());
    }
    let mut roll: Roll =
        serde_json::from_value(Value::Object(record)).expect("every field a roll needs is text");
    if roll.gacha_id.as_ref() == Some(&roll.gacha_type) {
        roll.gacha_id = None;
    }
    hsr::valid_roll(&roll).then_some(roll)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use std::sync::LazyLock;

    const TWO_ACCOUNTS: &[u8] = include_bytes!("../tests/fixtures/uigf/v4.2-two-accounts.json");
    const STARDB: &[u8] = include_bytes!("../tests/fixtures/uigf/stardb-v4.1.json");
    const LEGACY: &[u8] = include_bytes!("../tests/fixtures/uigf/uigf-v3.0.json");
    const SRGF: &[u8] = include_bytes!("../tests/fixtures/uigf/srgf-v1.0.json");
    /// UIGF's published schema, pinned in the fixtures.
    static SCHEMA: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
        let schema: Value =
            serde_json::from_slice(include_bytes!("../tests/fixtures/uigf/schema/uigf.json"))
                .unwrap();
        jsonschema::validator_for(&schema).unwrap()
    });

    fn fixture(bytes: &[u8]) -> Value {
        serde_json::from_slice(bytes).unwrap()
    }
    /// Read `file`, checking that UIGF's schema accepts each account the reader
    /// would import, alone in a file with the same `info`.
    fn read_checked(file: &Value) -> Result<File, Error> {
        let read = read(&serde_json::to_vec(file).unwrap());
        if let Ok(read) = &read {
            // Accounts with malformed UIDs are left out, so match by UID.
            for account in read
                .accounts
                .iter()
                .filter(|account| account.history.is_ok())
            {
                let source = file["hkrpg"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|source| uid_text(&source["uid"]) == account.uid)
                    .unwrap();
                let alone = json!({ "info": file["info"], "hkrpg": [source] });
                assert!(
                    SCHEMA.is_valid(&alone),
                    "the schema refuses an importable account"
                );
            }
        }
        read
    }
    fn uid_text(uid: &Value) -> String {
        uid.as_str().map_or_else(|| uid.to_string(), str::to_owned)
    }
    /// The rolls of `file`'s `index`th account, which must be importable.
    fn rolls_in(file: &Value, index: usize) -> Vec<Roll> {
        let account = read_checked(file).unwrap().accounts.remove(index);
        account.history.unwrap().rolls
    }
    /// Why the first account cannot be imported after `change`.
    fn problem(change: impl Fn(&mut Value)) -> Problem {
        let mut file = fixture(TWO_ACCOUNTS);
        change(&mut file);
        read_checked(&file)
            .unwrap()
            .accounts
            .remove(0)
            .history
            .unwrap_err()
    }
    /// RecordFaults lacking these fields, each counted that many times.
    fn missing(fields: &[(&'static str, usize)]) -> Problem {
        Problem::RecordFaults(RecordFaults {
            missing: fields.iter().copied().collect(),
            ..RecordFaults::default()
        })
    }
    /// The first account's records, to change.
    fn list(file: &mut Value) -> &mut Vec<Value> {
        file["hkrpg"][0]["list"].as_array_mut().unwrap()
    }

    #[test]
    fn star_rail_accounts_become_rolls_in_file_order_with_their_sources_fields() {
        let file = fixture(TWO_ACCOUNTS);
        assert!(SCHEMA.is_valid(&file));
        let read = read_checked(&file).unwrap();
        assert_eq!(read.malformed_uids, 0);
        assert_eq!(read.other_games, ["hk4e"]);
        let uids: Vec<_> = read.accounts.iter().map(|account| &account.uid).collect();
        assert_eq!(uids, ["800000001", "600000002"]);
        let timezones: Vec<_> = read
            .accounts
            .iter()
            .map(|account| account.history.as_ref().unwrap().timezone)
            .collect();
        assert_eq!(timezones, [8, -5]);

        let first = rolls_in(&file, 0);
        let ids: Vec<_> = first.iter().map(|roll| roll.id.as_str()).collect();
        assert_eq!(ids, ["9007199254740993123", "9007199254740993124", "1"]);
        // Each roll takes the account's UID and language, as HoYoverse's records
        // carry them, and keeps what its record gave.
        assert!(first.iter().all(|roll| roll.uid == "800000001"));
        assert!(
            first
                .iter()
                .all(|roll| roll.lang.as_deref() == Some("en-us"))
        );
        assert_eq!(first[0].gacha_id.as_deref(), Some("2003"));
        assert_eq!(first[0].count.as_deref(), Some("1"));
        assert_eq!(first[1].count, None);
        assert_eq!(first[0].time, first[1].time);
        assert_eq!(
            serde_json::to_string(&first[1].extra).unwrap(),
            r#"{"synthetic_note":{"kept":[1,2.50]}}"#
        );
        // Saved in the shape a retrieved roll has.
        let saved = serde_json::to_value(&first[0]).unwrap();
        let mut expected = fixture(TWO_ACCOUNTS)["hkrpg"][0]["list"][0].clone();
        expected["uid"] = json!("800000001");
        expected["lang"] = json!("en-us");
        assert_eq!(saved, expected);

        // Player data stays out of debug output.
        assert_eq!(format!("{:?}", read.accounts[0]), "Account([redacted])");
        assert_eq!(
            format!("{:?}", read.accounts[0].history.as_ref().unwrap()),
            "History([redacted])"
        );
        // An account without a language keeps none.
        let second = rolls_in(&file, 1);
        assert_eq!(second.len(), 1);
        assert!(second[0].lang.is_none());
    }

    #[test]
    fn the_field_lists_name_every_field_a_roll_has() {
        // A record lacking a field a roll needs is counted, never a panic, as long as
        // these lists match the roll's fields.
        let roll = serde_json::to_value(&rolls_in(&fixture(TWO_ACCOUNTS), 0)[0]).unwrap();
        let mut fields: Vec<_> = roll.as_object().unwrap().keys().cloned().collect();
        let mut listed: Vec<_> = REQUIRED
            .iter()
            .chain(&OPTIONAL)
            .map(|field| field.to_string())
            .collect();
        fields.sort();
        listed.sort();
        assert_eq!(fields, listed);
    }

    #[test]
    fn stardb_exports_give_integer_uids_as_text_and_lose_category_pool_ids() {
        let file = fixture(STARDB);
        assert!(SCHEMA.is_valid(&file));
        let read = read_checked(&file).unwrap();
        assert_eq!(read.accounts[0].uid, "700000003");
        assert_eq!(read.accounts[0].history.as_ref().unwrap().timezone, 1);
        let rolls = rolls_in(&file, 0);
        let categories: Vec<_> = rolls.iter().map(|roll| roll.gacha_type.as_str()).collect();
        assert_eq!(categories, ["1", "2", "11", "12", "21", "22"]);
        // A pool ID repeating its category is not a pool, so the roll has none.
        assert!(rolls.iter().all(|roll| roll.gacha_id.is_none()));
        // Only a pool ID equal to the roll's own category is dropped.
        let mut file = fixture(STARDB);
        file["hkrpg"][0]["list"][0]["gacha_id"] = json!("2");
        assert_eq!(rolls_in(&file, 0)[0].gacha_id.as_deref(), Some("2"));
    }

    #[test]
    fn other_formats_and_versions_are_refused_with_what_was_found() {
        let refused = |file: &Value| read_checked(file).unwrap_err();
        assert_eq!(
            read(LEGACY).unwrap_err(),
            Error::Unsupported(Found::LegacyUigf)
        );
        assert_eq!(read(SRGF).unwrap_err(), Error::Unsupported(Found::Srgf));
        for (version, major, minor) in [("v3.0", 3, 0), ("v4.3", 4, 3), ("v5.0", 5, 0)] {
            let mut file = fixture(TWO_ACCOUNTS);
            file["info"]["version"] = json!(version);
            assert_eq!(
                refused(&file),
                Error::Unsupported(Found::Version { major, minor }),
                "{version}"
            );
        }
        // v4.0 and v4.1 are read.
        for version in ["v4.0", "v4.1"] {
            let mut file = fixture(TWO_ACCOUNTS);
            file["info"]["version"] = json!(version);
            assert_eq!(read_checked(&file).unwrap().accounts.len(), 2, "{version}");
        }
    }

    #[test]
    fn oversized_ambiguous_and_malformed_files_are_refused_whole() {
        let mut exact = TWO_ACCOUNTS.to_vec();
        exact.resize(MAX_FILE_BYTES, b' ');
        assert!(read(&exact).is_ok());
        exact.push(b' ');
        assert_eq!(read(&exact).unwrap_err(), Error::TooLarge);
        for bytes in [&b"{"[..], b"", br#"{"info":{},"info":{}}"#] {
            assert_eq!(read(bytes).unwrap_err(), Error::NotJson);
        }
        // Each change breaks the file's UIGF structure, which the schema checks too.
        let changes: [(&str, Value); 22] = [
            ("", json!([])),
            ("/info", json!(null)),
            ("/info", json!({})),
            ("/info/version", json!(4.2)),
            ("/info/version", json!("4.2")),
            ("/info/version", json!("v4")),
            ("/info/version", json!("v4.2.0")),
            ("/info/version", json!("vx.2")),
            ("/info/export_app", json!(null)),
            ("/info/export_app_version", json!(1)),
            ("/info/export_timestamp", json!(1.5)),
            ("/hkrpg", json!({})),
            ("/hkrpg/0", json!("800000001")),
            ("/hkrpg/0/uid", json!(null)),
            ("/hkrpg/0/uid", json!(1.5)),
            ("/hkrpg/0/timezone", json!("8")),
            ("/hkrpg/0/timezone", json!(null)),
            ("/hkrpg/0/lang", json!(null)),
            ("/hkrpg/0/lang", json!("en")),
            ("/hkrpg/0/list", json!(null)),
            ("/hkrpg/0/list/0", json!(null)),
            ("/hkrpg/0/list/0", json!(["id"])),
        ];
        for (path, value) in changes {
            let mut file = fixture(TWO_ACCOUNTS);
            *file.pointer_mut(path).unwrap() = value;
            assert!(!SCHEMA.is_valid(&file), "{path}");
            assert_eq!(read_checked(&file).unwrap_err(), Error::NotUigf, "{path}");
        }
        for path in [
            "/info",
            "/info/version",
            "/info/export_app",
            "/hkrpg/0/uid",
            "/hkrpg/0/timezone",
            "/hkrpg/0/list",
        ] {
            let mut file = fixture(TWO_ACCOUNTS);
            let (parent, key) = path.rsplit_once('/').unwrap();
            file.pointer_mut(parent)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove(key);
            assert_eq!(read_checked(&file).unwrap_err(), Error::NotUigf, "{path}");
        }
        // A version past any number is refused too, though its shape is UIGF's.
        for version in ["v99999999999999999999.0", "v4.99999999999999999999"] {
            let mut file = fixture(TWO_ACCOUNTS);
            file["info"]["version"] = json!(version);
            assert_eq!(
                read_checked(&file).unwrap_err(),
                Error::NotUigf,
                "{version}"
            );
        }
        // Integer time stamps are UIGF's other form.
        let mut file = fixture(TWO_ACCOUNTS);
        file["info"]["export_timestamp"] = json!("1767225600");
        assert!(read_checked(&file).is_ok());
    }

    #[test]
    fn a_file_without_star_rail_accounts_reads_as_none() {
        let mut file = fixture(TWO_ACCOUNTS);
        file.as_object_mut().unwrap().remove("hkrpg");
        file["nap"] = json!([]);
        file["hk4e_ugc"] = json!([]);
        let read = read_checked(&file).unwrap();
        assert!(read.accounts.is_empty());
        assert_eq!(read.other_games, ["hk4e", "nap", "hk4e_ugc"]);
    }

    #[test]
    fn accounts_that_cannot_be_imported_say_why() {
        for timezone in [-13, 15, 4_294_967_304_i64] {
            assert_eq!(
                problem(|file| file["hkrpg"][0]["timezone"] = json!(timezone)),
                Problem::InvalidTimezone,
                "{timezone}"
            );
        }
        assert_eq!(
            problem(|file| file["hkrpg"][0]["list"] = json!([])),
            Problem::NoRolls
        );
        // Both copies of a repeated UID, whether given as text or a number.
        let mut file = fixture(TWO_ACCOUNTS);
        file["hkrpg"][1]["uid"] = json!(800000001);
        let read = read_checked(&file).unwrap();
        assert_eq!(read.accounts.len(), 2);
        for account in read.accounts {
            assert_eq!(account.uid, "800000001");
            assert_eq!(account.history.unwrap_err(), Problem::Repeated);
        }
        // A UID that is not digits is counted, never shown.
        for uid in [
            json!("8000 0001"),
            json!(""),
            json!("８００"),
            json!(-800000001),
        ] {
            let mut file = fixture(TWO_ACCOUNTS);
            file["hkrpg"][0]["uid"] = uid.clone();
            let read = read_checked(&file).unwrap();
            assert_eq!(read.malformed_uids, 1, "{uid}");
            let uids: Vec<_> = read.accounts.iter().map(|account| &account.uid).collect();
            assert_eq!(uids, ["600000002"], "{uid}");
        }
    }

    #[test]
    fn many_accounts_are_read_in_linear_time() {
        // A crafted file can hold millions of empty accounts within the size bound;
        // comparing each UID with every other would take hours.
        let accounts: Vec<Value> = (0..100_000_u64)
            .map(|uid| json!({ "uid": 800_000_000 + uid, "timezone": 8, "list": [] }))
            .collect();
        let mut file = fixture(TWO_ACCOUNTS);
        file["hkrpg"] = Value::Array(accounts);
        let bytes = serde_json::to_vec(&file).unwrap();
        let start = std::time::Instant::now();
        let read = read(&bytes).unwrap();
        assert_eq!(read.accounts.len(), 100_000);
        assert!(
            start.elapsed() < std::time::Duration::from_secs(10),
            "{:?}",
            start.elapsed()
        );
    }

    #[test]
    fn records_lacking_fields_are_counted_by_field() {
        // UIGF's required fields, then the name, item type and rarity.
        let lacking = problem(|file| {
            let list = list(file);
            for (index, field) in [(0, "name"), (1, "name"), (1, "rank_type"), (2, "gacha_id")] {
                list[index].as_object_mut().unwrap().remove(field);
            }
        });
        assert_eq!(
            lacking,
            missing(&[("gacha_id", 1), ("name", 2), ("rank_type", 1)])
        );
        for field in ["id", "gacha_type", "item_id", "time", "item_type"] {
            let lacking = problem(|file| {
                list(file)[0].as_object_mut().unwrap().remove(field);
            });
            assert_eq!(lacking, missing(&[(field, 1)]), "{field}");
        }
    }

    #[test]
    fn records_with_invalid_values_are_counted() {
        let changes: [(&str, Value); 14] = [
            ("id", json!("90071992547409931234")),
            ("id", json!("9007a")),
            ("id", json!(1)),
            ("gacha_type", json!("99")),
            ("gacha_id", json!("")),
            ("gacha_id", json!(null)),
            ("count", json!("2")),
            ("count", json!(null)),
            ("rank_type", json!("6")),
            ("time", json!("2026-02-30 12:00:00")),
            ("time", json!("2026-01-01T12:00:00")),
            ("name", json!(null)),
            ("uid", json!("800000002")),
            ("lang", json!(7)),
        ];
        for (field, value) in changes {
            let invalid = Problem::RecordFaults(RecordFaults {
                invalid: 1,
                ..RecordFaults::default()
            });
            assert_eq!(
                problem(|file| list(file)[0][field] = value.clone()),
                invalid,
                "{field} {value}"
            );
        }
        // A record may carry the account's own UID, and a language of its own.
        let mut file = fixture(TWO_ACCOUNTS);
        list(&mut file)[0]["uid"] = json!("800000001");
        list(&mut file)[0]["lang"] = json!("de-de");
        assert_eq!(rolls_in(&file, 0)[0].lang.as_deref(), Some("de-de"));
    }

    #[test]
    fn categories_21_and_22_need_uigf_v4_1() {
        let mut file = fixture(STARDB);
        file["info"]["version"] = json!("v4.0");
        let newer = Problem::RecordFaults(RecordFaults {
            newer_categories: 2,
            ..RecordFaults::default()
        });
        let history = read_checked(&file).unwrap().accounts.remove(0).history;
        assert_eq!(history.unwrap_err(), newer);
    }
}
