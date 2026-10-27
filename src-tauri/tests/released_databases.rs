//! Databases written by released versions open in this one with their history intact
//! (decision 0029). Each fixture is a synthetic database a release wrote, frozen once
//! it is committed; each migration's tests open it.
use astral_index::acquisition::Category;
use astral_index::storage::{
    Account, CategorySummary, CategoryTotal, Filter, LastImport, Refusal, SavedAccount, Schema,
    Source, Store, StoredRoll, Summary, check_database,
};
use common::{Folder, imports, release_1_0_0};
use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

mod common;

const RELEASE_1_0_0_SHA256: &str =
    "54c32e1cb6d3589e8389726268b2f796652d51a895951f87fa9898932a186727";

const UID: &str = "100000002";
const OTHER_UID: &str = "100000003";
const ASIA: &str = "prod_official_asia";
const AMERICA: &str = "prod_official_usa";
/// A test-only migration after 1.0.0's schema, as the first real one will be.
const BANNER: &str = "ALTER TABLE rolls ADD COLUMN banner TEXT";
const UPGRADED: Schema = Schema::with_migrations(&[BANNER]);
/// A test-only rebuild of a table others refer to, by SQLite's procedure for schema
/// changes `ALTER TABLE` can't make: a new table, its rows copied, the old one
/// dropped and the new one renamed into its place.
const REBUILD_ACCOUNTS: &str = "CREATE TABLE accounts_new (
    game TEXT NOT NULL,
    uid TEXT NOT NULL,
    server TEXT NOT NULL,
    timezone INTEGER,
    label TEXT,
    PRIMARY KEY(game, uid, server)
) STRICT;
INSERT INTO accounts_new(game, uid, server, timezone)
    SELECT game, uid, server, timezone FROM accounts;
DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;";
const REBUILT: Schema = Schema::with_migrations(&[REBUILD_ACCOUNTS]);
/// The app's schema, and migrations newer, which must keep every history too.
const SCHEMAS: [Schema; 3] = [Schema::CURRENT, UPGRADED, REBUILT];

/// A copy of a fixture in its own folder, one per test, so opening it never touches
/// the committed file.
struct Copy(Folder);
impl Copy {
    fn of(fixture: &Path) -> Self {
        let copy = Self(Folder::new());
        std::fs::copy(fixture, copy.path()).unwrap();
        copy
    }
    fn path(&self) -> PathBuf {
        self.0.path("history.sqlite")
    }
}

/// One Character Event roll of the main account: the n-th, a minute apart.
fn character_event(n: usize) -> StoredRoll {
    let (name, item_type, rank_type) = match n {
        10 => ("Synthetic 5★ character", "Character", "5"),
        5 => ("Synthetic 4★ character", "Character", "4"),
        _ => ("Synthetic 3★ light cone", "Light Cone", "3"),
    };
    StoredRoll {
        number: n,
        pity: if n > 10 { n - 10 } else { n },
        id: format!("17000000000000000{n:02}"),
        name: name.to_owned(),
        item_type: item_type.to_owned(),
        rank_type: rank_type.to_owned(),
        time: format!("2026-09-01 10:{n:02}:00"),
    }
}

fn totals(counts: [(Category, usize); 6]) -> Vec<CategoryTotal> {
    Category::ALL
        .into_iter()
        .map(|category| CategoryTotal {
            gacha_type: category.code(),
            total: counts
                .iter()
                .find(|(counted, _)| *counted == category)
                .unwrap()
                .1,
        })
        .collect()
}

#[test]
fn the_1_0_0_fixture_is_the_one_committed() {
    let bytes = std::fs::read(release_1_0_0()).unwrap();
    let digest = format!("{:x}", Sha256::digest(&bytes));
    assert_eq!(
        digest, RELEASE_1_0_0_SHA256,
        "the 1.0.0 fixture changed: restore it, as it stands for what 1.0.0 wrote"
    );
    let connection = Connection::open(release_1_0_0()).unwrap();
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 2, "1.0.0 released schema version 2");
}

#[test]
fn a_1_0_0_database_opens_with_its_accounts_and_imports() {
    for schema in SCHEMAS {
        let copy = Copy::of(&release_1_0_0());
        let store = Store::open_with(&copy.path(), schema, None).unwrap();
        // The account imported into last comes first.
        assert_eq!(
            store.accounts().unwrap(),
            [
                SavedAccount {
                    uid: OTHER_UID.to_owned(),
                    server: ASIA.to_owned(),
                    timezone: None,
                    rolls: 2,
                },
                SavedAccount {
                    uid: UID.to_owned(),
                    server: ASIA.to_owned(),
                    timezone: Some(8),
                    rolls: 17,
                },
                SavedAccount {
                    uid: UID.to_owned(),
                    server: AMERICA.to_owned(),
                    timezone: Some(-5),
                    rolls: 3,
                },
            ]
        );
        assert_eq!(
            store.latest_account().unwrap(),
            Some(Account {
                uid: OTHER_UID.to_owned(),
                server: ASIA.to_owned(),
                timezone: None,
            })
        );
        assert_eq!(
            store.last_import().unwrap(),
            Some(LastImport {
                imported_at: 1_790_000_900,
                source: Source::Hoyoverse,
                uid: OTHER_UID.to_owned(),
                server: ASIA.to_owned(),
                inserted: 2,
            })
        );
        drop(store);
        // Every import's counts, the repeated one's duplicates included.
        assert_eq!(
            imports(&copy.path()),
            [
                (UID.to_owned(), ASIA.to_owned(), 1_790_000_000, 13, 0),
                (UID.to_owned(), AMERICA.to_owned(), 1_790_000_300, 3, 0),
                (UID.to_owned(), ASIA.to_owned(), 1_790_000_600, 4, 10),
                (OTHER_UID.to_owned(), ASIA.to_owned(), 1_790_000_900, 2, 0),
            ]
        );
    }
}

#[test]
fn a_1_0_0_database_keeps_each_accounts_rolls_and_pity() {
    for schema in SCHEMAS {
        let copy = Copy::of(&release_1_0_0());
        let store = Store::open_with(&copy.path(), schema, None).unwrap();
        let page = store
            .page(
                UID,
                ASIA,
                Category::CharacterEvent,
                &Filter::default(),
                0,
                20,
            )
            .unwrap();
        assert_eq!(page.total, 12);
        assert_eq!(page.matched, 12);
        assert_eq!(
            page.categories,
            totals([
                (Category::Stellar, 2),
                (Category::Departure, 0),
                (Category::CharacterEvent, 12),
                (Category::LightConeEvent, 3),
                (Category::CharacterCollaboration, 0),
                (Category::LightConeCollaboration, 0),
            ])
        );
        assert_eq!(
            page.summary,
            CategorySummary {
                five_star: 1,
                four_star: 1,
                first: Some("2026-09-01 10:01:00".to_owned()),
                last: Some("2026-09-01 10:12:00".to_owned()),
            }
        );
        assert_eq!(
            page.rolls,
            (1..=12).rev().map(character_event).collect::<Vec<_>>()
        );
        // The same UID on another server is a separate account.
        let america = store
            .page(UID, AMERICA, Category::Departure, &Filter::default(), 0, 20)
            .unwrap();
        assert_eq!(
            america.categories,
            totals([
                (Category::Stellar, 0),
                (Category::Departure, 3),
                (Category::CharacterEvent, 0),
                (Category::LightConeEvent, 0),
                (Category::CharacterCollaboration, 0),
                (Category::LightConeCollaboration, 0),
            ])
        );
        let other = store
            .page(
                OTHER_UID,
                ASIA,
                Category::CharacterCollaboration,
                &Filter::default(),
                0,
                20,
            )
            .unwrap();
        assert_eq!(other.total, 2);
        // A field HoYoverse added and the app does not know is kept with its roll.
        let stellar = store
            .history(UID, ASIA)
            .unwrap()
            .into_iter()
            .filter(|roll| roll.gacha_type == Category::Stellar.code())
            .map(|roll| json!(roll))
            .collect::<Vec<_>>();
        assert_eq!(stellar.len(), 2);
        assert_eq!(stellar[0]["synthetic_extension"], json!({ "kept": true }));
    }
}

#[test]
fn a_1_0_0_database_takes_new_imports_and_skips_saved_rolls() {
    for schema in SCHEMAS {
        let copy = Copy::of(&release_1_0_0());
        let mut store = Store::open_with(&copy.path(), schema, None).unwrap();
        let list: Vec<_> = (1..=13)
            .map(|n| {
                let roll = character_event(n);
                json!({
                    "uid": UID, "id": roll.id, "gacha_id": "2001", "gacha_type": "11",
                    "item_id": "synthetic-item", "count": "1", "time": roll.time,
                    "name": roll.name, "lang": "en", "item_type": roll.item_type,
                    "rank_type": roll.rank_type,
                })
            })
            .collect();
        let page = json!({
            "retcode": 0, "message": "OK",
            "data": { "page": "1", "size": "20", "region": ASIA, "region_time_zone": 8, "list": list },
        });
        let bytes = serde_json::to_vec(&page).unwrap();
        let preview = store.preview(UID, ASIA, &[&bytes]).unwrap();
        assert_eq!(
            store.commit(preview, 1_790_001_200).unwrap(),
            Summary {
                inserted: 1,
                duplicates: 12,
                conflicts: 0,
            }
        );
        let page = store
            .page(
                UID,
                ASIA,
                Category::CharacterEvent,
                &Filter::default(),
                0,
                1,
            )
            .unwrap();
        assert_eq!(page.total, 13);
        assert_eq!(page.rolls, [character_event(13)]);
    }
}

#[test]
fn upgrading_a_1_0_0_database_lets_the_caller_keep_it_unchanged_first() {
    let copy = Copy::of(&release_1_0_0());
    let fixture = std::fs::read(release_1_0_0()).unwrap();
    let mut kept = None;
    Store::open_with(
        &copy.path(),
        UPGRADED,
        Some(&mut |version| {
            kept = Some((version, std::fs::read(copy.path()).unwrap()));
            Ok(())
        }),
    )
    .unwrap();
    assert_eq!(kept, Some((2, fixture)));
    let version: i32 = Connection::open(copy.path())
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 3);
    // Once upgraded, it opens as it is, with nothing more to keep.
    Store::open_with(
        &copy.path(),
        UPGRADED,
        Some(&mut |_| panic!("nothing to keep")),
    )
    .unwrap();
}

#[test]
fn a_failed_migration_or_keep_leaves_a_1_0_0_database_unchanged() {
    let fixture = std::fs::read(release_1_0_0()).unwrap();
    let failing = Schema::with_migrations(&[BANNER, "ALTER TABLE missing ADD COLUMN x TEXT"]);
    let copy = Copy::of(&release_1_0_0());
    assert!(Store::open_with(&copy.path(), failing, None).is_err());
    assert_eq!(std::fs::read(copy.path()).unwrap(), fixture);
    let refused = Store::open_with(
        &copy.path(),
        UPGRADED,
        Some(&mut |_| Err(astral_index::storage::Error::Database)),
    );
    assert!(refused.is_err());
    assert_eq!(std::fs::read(copy.path()).unwrap(), fixture);
}

#[test]
fn the_check_expects_each_version_s_schema_as_its_migrations_build_it() {
    let copy = Copy::of(&release_1_0_0());
    // The release's own version, before and after upgrading.
    assert_eq!(check_database(&copy.path(), UPGRADED), Ok(()));
    drop(Store::open_with(&copy.path(), UPGRADED, None).unwrap());
    assert_eq!(check_database(&copy.path(), UPGRADED), Ok(()));
    // The app's schema doesn't know the newer version.
    assert_eq!(
        check_database(&copy.path(), Schema::CURRENT),
        Err(Refusal::Newer)
    );
    // A new database at that version has exactly the upgraded one's schema.
    let fresh = Copy::of(&release_1_0_0());
    std::fs::remove_file(fresh.path()).unwrap();
    let new = Store::open_with(
        &fresh.path(),
        UPGRADED,
        Some(&mut |_| panic!("a new database has nothing to keep")),
    );
    drop(new.unwrap());
    assert_eq!(check_database(&fresh.path(), UPGRADED), Ok(()));
    // A file at the newer version whose schema lacks the migration is damaged.
    let unmigrated = Copy::of(&release_1_0_0());
    Connection::open(unmigrated.path())
        .unwrap()
        .execute_batch("PRAGMA user_version=3")
        .unwrap();
    assert_eq!(
        check_database(&unmigrated.path(), UPGRADED),
        Err(Refusal::Damaged)
    );
}

#[test]
fn a_migration_that_breaks_a_reference_fails_and_leaves_the_database_unchanged() {
    let fixture = std::fs::read(release_1_0_0()).unwrap();
    // The other account still has rolls and imports.
    let orphaning = Schema::with_migrations(&["DELETE FROM accounts WHERE uid = '100000003'"]);
    let copy = Copy::of(&release_1_0_0());
    assert!(Store::open_with(&copy.path(), orphaning, None).is_err());
    assert_eq!(std::fs::read(copy.path()).unwrap(), fixture);
}

#[test]
fn a_rebuilt_1_0_0_database_keeps_every_reference() {
    let copy = Copy::of(&release_1_0_0());
    drop(Store::open_with(&copy.path(), REBUILT, None).unwrap());
    let connection = Connection::open(copy.path()).unwrap();
    let violations: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(violations, 0);
    // The other tables still refer to accounts by its own name.
    let referring: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE sql LIKE '%REFERENCES accounts(%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(referring, 2);
}
