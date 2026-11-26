//! Saved histories exported through `file_export` and imported back as the Import
//! screen does (`uigf::read`, then `file_import::resolve`): into the history they
//! came from, and into an empty one.

use astral_index::file_export::{self, ExportedAccount};
use astral_index::file_import;
use astral_index::hsr::{Batch, Roll};
use astral_index::storage::{AccountHistory, Chosen, Source, Store, Summary};
use astral_index::uigf::{self, Exported};
use common::Folder;

mod common;

const ASIA: &str = "prod_official_asia";
const EUROPE: &str = "prod_official_eur";
/// Synthetic UIDs whose leading digit gives Asia (8) and Europe (7).
const ASIAN: &str = "800000001";
const EUROPEAN: &str = "700000003";
/// Roll IDs of 19 digits, beyond what a 64-bit float or signed integer holds exactly.
const LONG: &str = "9999999999999999999";
const LONG_NEXT: &str = "9999999999999999998";

/// A roll as HoYoverse gives it, in category `category` at `time`, of an item named
/// after its ID, so no two rolls' fields are alike.
fn roll(uid: &str, id: &str, category: &str, time: &str, gacha_id: Option<&str>) -> Roll {
    Roll {
        extra: Default::default(),
        uid: uid.into(),
        id: id.into(),
        gacha_id: gacha_id.map(Into::into),
        gacha_type: category.into(),
        item_id: id[id.len() - 4..].into(),
        count: Some("1".into()),
        time: time.into(),
        name: format!("Synthetic item {id}"),
        lang: Some("en-us".into()),
        item_type: "Character".into(),
        rank_type: "5".into(),
    }
}
/// Save `rolls` as one retrieval of account `uid` on `server`.
fn save(store: &mut Store, uid: &str, server: &str, timezone: i32, rolls: Vec<Roll>) {
    let batch = Batch {
        uid: uid.into(),
        server: server.into(),
        timezone: Some(timezone),
        rolls,
    };
    let preview = store.preview(Source::Hoyoverse, batch).unwrap();
    store.commit(preview, 1234).unwrap();
}
/// Two accounts on different servers: Asia's with two rolls of the same second, one
/// with a 19-digit ID, in two categories, and one roll saved without a pool ID.
fn two_accounts(store: &mut Store) {
    let asian = vec![
        roll(ASIAN, LONG, "11", "2026-01-01 12:00:00", Some("2003")),
        roll(ASIAN, LONG_NEXT, "11", "2026-01-01 12:00:00", Some("2003")),
        roll(
            ASIAN,
            "1000000000000000001",
            "1",
            "2026-01-02 08:00:00",
            Some("1001"),
        ),
        roll(
            ASIAN,
            "1000000000000000002",
            "1",
            "2026-01-02 08:00:01",
            None,
        ),
    ];
    save(store, ASIAN, ASIA, 8, asian);
    let european = vec![roll(
        EUROPEAN,
        "1000000000000000003",
        "2",
        "2026-01-03 09:00:00",
        Some("4001"),
    )];
    save(store, EUROPEAN, EUROPE, 1, european);
}
fn export(store: &Store, chosen: Chosen<'_>) -> file_export::Export {
    let histories = store.histories(chosen).unwrap();
    file_export::build(&histories, "1.3.0", 1_767_225_600, &uigf::schema()).unwrap()
}
/// Import and save each account of `bytes` into `store` as the Import screen would,
/// returning each account's UID, server and summary.
fn import(store: &mut Store, bytes: &[u8]) -> Vec<(String, String, Summary)> {
    let saved = store.accounts().unwrap();
    let (_, batches) = file_import::resolve(uigf::read(bytes).unwrap(), &saved);
    batches
        .into_iter()
        .map(|batch: Batch| {
            let (uid, server) = (batch.uid.clone(), batch.server.clone());
            let preview = store.preview(Source::Uigf, batch).unwrap();
            (uid, server, store.commit(preview, 5678).unwrap())
        })
        .collect()
}
fn account<'a>(histories: &'a mut [AccountHistory], uid: &str) -> &'a mut AccountHistory {
    histories
        .iter_mut()
        .find(|history| history.uid == uid)
        .unwrap()
}
fn ids(history: &AccountHistory) -> Vec<&str> {
    history.rolls.iter().map(|roll| roll.id.as_str()).collect()
}

#[test]
fn an_export_imports_back_into_its_history_as_duplicates_only() {
    let folder = Folder::new();
    let mut store = Store::open(&folder.path("history.sqlite")).unwrap();
    two_accounts(&mut store);
    let export = export(&store, Chosen::All);
    assert_eq!(
        export.accounts,
        [
            ExportedAccount {
                uid: EUROPEAN.into(),
                server: EUROPE.into(),
                outcome: Exported::Rolls {
                    written: 1,
                    without_pool_id: 0
                },
            },
            ExportedAccount {
                uid: ASIAN.into(),
                server: ASIA.into(),
                outcome: Exported::Rolls {
                    written: 3,
                    without_pool_id: 1
                },
            },
        ]
    );
    let duplicates = |duplicates| Summary {
        duplicates,
        ..Default::default()
    };
    let before = store.histories(Chosen::All).unwrap();
    assert_eq!(
        import(&mut store, &export.bytes),
        [
            (EUROPEAN.into(), EUROPE.into(), duplicates(1)),
            (ASIAN.into(), ASIA.into(), duplicates(3)),
        ]
    );
    assert_eq!(store.histories(Chosen::All).unwrap(), before);
}

#[test]
fn an_export_imported_into_an_empty_history_gives_each_account_its_rolls_unchanged() {
    let folder = Folder::new();
    let mut original = Store::open(&folder.path("original.sqlite")).unwrap();
    two_accounts(&mut original);
    let export = export(&original, Chosen::All);
    let mut copy = Store::open(&folder.path("copy.sqlite")).unwrap();
    let inserted = |inserted| Summary {
        inserted,
        ..Default::default()
    };
    assert_eq!(
        import(&mut copy, &export.bytes),
        [
            (EUROPEAN.into(), EUROPE.into(), inserted(1)),
            (ASIAN.into(), ASIA.into(), inserted(3)),
        ]
    );
    // Every field of every written roll, the 19-digit IDs among them, comes back
    // under its own account and server; the roll without a pool ID does not.
    let mut expected = original.histories(Chosen::All).unwrap();
    account(&mut expected, ASIAN)
        .rolls
        .retain(|roll| roll.gacha_id.is_some());
    let mut copied = copy.histories(Chosen::All).unwrap();
    assert_eq!(copied, expected);
    assert_eq!(
        ids(account(&mut copied, ASIAN)),
        ["1000000000000000001", LONG_NEXT, LONG]
    );
}

#[test]
fn a_uid_saved_on_two_servers_is_left_out_of_all_accounts_but_exports_alone() {
    let folder = Folder::new();
    let mut store = Store::open(&folder.path("history.sqlite")).unwrap();
    two_accounts(&mut store);
    let elsewhere = roll(
        ASIAN,
        "1000000000000000009",
        "11",
        "2026-01-04 10:00:00",
        Some("2003"),
    );
    save(&mut store, ASIAN, "prod_official_cht", 8, vec![elsewhere]);

    let all = export(&store, Chosen::All);
    let outcomes: Vec<_> = all
        .accounts
        .iter()
        .map(|account| &account.outcome)
        .collect();
    assert_eq!(
        outcomes,
        [
            &Exported::Rolls {
                written: 1,
                without_pool_id: 0
            },
            &Exported::RepeatedUid,
            &Exported::RepeatedUid,
        ]
    );
    let accounts = uigf::read(&all.bytes).unwrap().accounts;
    let uids: Vec<_> = accounts
        .iter()
        .map(|account| account.uid.as_str())
        .collect();
    assert_eq!(uids, [EUROPEAN]);

    // Alone, Asia's account is exported, and an empty history takes it in.
    let alone = export(
        &store,
        Chosen::One {
            uid: ASIAN,
            server: ASIA,
        },
    );
    let mut copy = Store::open(&folder.path("copy.sqlite")).unwrap();
    let imported = import(&mut copy, &alone.bytes);
    let inserted = Summary {
        inserted: 3,
        ..Default::default()
    };
    assert_eq!(imported, [(ASIAN.into(), ASIA.into(), inserted)]);
}
