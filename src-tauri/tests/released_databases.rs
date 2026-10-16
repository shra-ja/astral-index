//! Databases written by released versions open in this one with their history intact
//! (decision 0029). Each fixture is a synthetic database a release wrote, frozen once
//! it is committed; each migration's tests open it.
use astral_index::acquisition::Category;
use astral_index::storage::{
    Account, CategorySummary, CategoryTotal, Filter, LastImport, SavedAccount, Source, Store,
    StoredRoll, Summary,
};
use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

/// 1.0.0's database, written by its own `Store` from the synthetic history described
/// in fixtures/storage/README.md.
const RELEASE_1_0_0: &str = "tests/fixtures/storage/history-1.0.0.sqlite";
const RELEASE_1_0_0_SHA256: &str =
    "54c32e1cb6d3589e8389726268b2f796652d51a895951f87fa9898932a186727";

const UID: &str = "100000002";
const OTHER_UID: &str = "100000003";
const ASIA: &str = "prod_official_asia";
const AMERICA: &str = "prod_official_usa";
static NEXT: AtomicU64 = AtomicU64::new(0);

/// A copy of a fixture in its own folder, one per test, so opening it never touches
/// the committed file.
struct Copy(PathBuf);
impl Copy {
    fn of(fixture: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "astral-index-released-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&folder).unwrap();
        let path = folder.join("history.sqlite");
        std::fs::copy(fixture_path(fixture), &path).unwrap();
        Self(path)
    }
}
impl Drop for Copy {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}

fn fixture_path(fixture: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(fixture)
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
    let bytes = std::fs::read(fixture_path(RELEASE_1_0_0)).unwrap();
    let digest = format!("{:x}", Sha256::digest(&bytes));
    assert_eq!(
        digest, RELEASE_1_0_0_SHA256,
        "the 1.0.0 fixture changed: restore it, as it stands for what 1.0.0 wrote"
    );
    let connection = Connection::open(fixture_path(RELEASE_1_0_0)).unwrap();
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 2, "1.0.0 released schema version 2");
}

#[test]
fn a_1_0_0_database_opens_with_its_accounts_and_imports() {
    let copy = Copy::of(RELEASE_1_0_0);
    let store = Store::open(&copy.0).unwrap();
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
    let connection = Connection::open(&copy.0).unwrap();
    let mut batches = connection
        .prepare("SELECT uid,server,imported_at,inserted,duplicates FROM batches ORDER BY id")
        .unwrap();
    let batches: Vec<(String, String, i64, i64, i64)> = batches
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        batches,
        [
            (UID.to_owned(), ASIA.to_owned(), 1_790_000_000, 13, 0),
            (UID.to_owned(), AMERICA.to_owned(), 1_790_000_300, 3, 0),
            (UID.to_owned(), ASIA.to_owned(), 1_790_000_600, 4, 10),
            (OTHER_UID.to_owned(), ASIA.to_owned(), 1_790_000_900, 2, 0),
        ]
    );
}

#[test]
fn a_1_0_0_database_keeps_each_accounts_rolls_and_pity() {
    let copy = Copy::of(RELEASE_1_0_0);
    let store = Store::open(&copy.0).unwrap();
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

#[test]
fn a_1_0_0_database_takes_new_imports_and_skips_saved_rolls() {
    let copy = Copy::of(RELEASE_1_0_0);
    let mut store = Store::open(&copy.0).unwrap();
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
