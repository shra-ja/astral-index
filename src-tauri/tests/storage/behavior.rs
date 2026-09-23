use crate::storage::{Error, Store, Summary};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
const PAGE: &[u8] = include_bytes!("../fixtures/hsr-api/page.json");
const UID: &str = "100000002";
const SERVER: &str = "synthetic-server";
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Database(PathBuf);
impl Database {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "roll-tracker-storage-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path.join("history.sqlite"))
    }
    fn store(&self) -> Store {
        Store::open(&self.0).unwrap()
    }
    fn connection(&self) -> Connection {
        Connection::open(&self.0).unwrap()
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}
fn page(edit: impl FnOnce(&mut Value)) -> Vec<u8> {
    let mut value: Value = serde_json::from_slice(PAGE).unwrap();
    edit(&mut value);
    serde_json::to_vec(&value).unwrap()
}
fn summary(inserted: usize, duplicates: usize, conflicts: usize) -> Summary {
    Summary {
        inserted,
        duplicates,
        conflicts,
    }
}
fn import(store: &mut Store, bytes: &[u8]) -> Summary {
    let preview = store.preview(UID, SERVER, &[bytes]).unwrap();
    store.commit(preview, 1234).unwrap()
}

#[test]
fn preview_does_not_write_and_commit_survives_restart_with_exact_fields() {
    let db = Database::new();
    let mut store = db.store();
    let bytes = page(|p| {
        p["data"]["list"][0]["future"] = json!({"synthetic":true});
    });
    let preview = store.preview(UID, SERVER, &[&bytes]).unwrap();
    assert_eq!(preview.summary(), summary(2, 0, 0));
    assert!(store.history(UID, SERVER).unwrap().is_empty());
    assert_eq!(store.commit(preview, 1234).unwrap(), summary(2, 0, 0));
    drop(store);
    let stored = db.store().history(UID, SERVER).unwrap();
    let expected = crate::parse_response(&bytes).unwrap();
    assert_eq!(stored.len(), 2);
    assert!(expected.list.iter().all(|r| stored.contains(r)));
    let conn = db.connection();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM batches", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM batch_rolls", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    let saved: String = conn
        .query_row("SELECT pages FROM batches", [], |r| r.get(0))
        .unwrap();
    let saved: Value = serde_json::from_str(&saved).unwrap();
    assert_eq!(saved[0]["list"][0]["id"], "9007199254740993");
    assert_eq!(saved[0]["region_time_zone"], 8);
}

#[test]
fn repeats_overlaps_and_same_second_distinct_ids_are_safe() {
    let db = Database::new();
    let mut store = db.store();
    assert_eq!(import(&mut store, PAGE), summary(2, 0, 0));
    assert_eq!(import(&mut store, PAGE), summary(0, 2, 0));
    let overlap = page(|p| p["data"]["list"][1]["id"] = json!("0007199254740991"));
    let preview = store.preview(UID, SERVER, &[PAGE, &overlap]).unwrap();
    assert_eq!(preview.summary(), summary(1, 3, 0));
    store.commit(preview, 1234).unwrap();
    assert_eq!(store.history(UID, SERVER).unwrap().len(), 3);
}

#[test]
fn conflicting_records_block_the_whole_batch() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let conflict = page(|p| {
        p["data"]["list"][0]["id"] = json!("9007199254740994");
        p["data"]["list"][1]["item_id"] = json!("different-item");
    });
    let preview = store.preview(UID, SERVER, &[&conflict]).unwrap();
    assert_eq!(preview.summary(), summary(1, 0, 1));
    assert_eq!(store.commit(preview, 1234), Err(Error::Conflict));
    assert_eq!(store.history(UID, SERVER).unwrap().len(), 2);
    let conflicting_pair = page(|p| {
        p["data"]["list"][1]["id"] = p["data"]["list"][0]["id"].clone();
        p["data"]["list"][1]["name"] = json!("different-label");
    });
    let db2 = Database::new();
    let mut fresh = db2.store();
    let preview = fresh.preview(UID, SERVER, &[&conflicting_pair]).unwrap();
    assert_eq!(preview.summary(), summary(1, 0, 1));
    assert_eq!(fresh.commit(preview, 1234), Err(Error::Conflict));
    assert!(fresh.history(UID, SERVER).unwrap().is_empty());
}

#[test]
fn validates_all_pages_and_explicit_account_context_before_writes() {
    let db = Database::new();
    let mut store = db.store();
    for (uid, server) in [
        ("", SERVER),
        ("not-digits", SERVER),
        (UID, ""),
        (UID, "   "),
    ] {
        assert!(matches!(
            store.preview(uid, server, &[PAGE]),
            Err(Error::Context)
        ));
    }
    assert!(matches!(
        store.preview("100000003", SERVER, &[PAGE]),
        Err(Error::Context)
    ));
    assert!(matches!(
        store.preview(UID, "other-server", &[PAGE]),
        Err(Error::Context)
    ));
    let offset = page(|p| p["data"]["region_time_zone"] = json!(-5));
    assert!(matches!(
        store.preview(UID, SERVER, &[PAGE, &offset]),
        Err(Error::Context)
    ));
    assert!(matches!(
        store.preview(UID, SERVER, &[PAGE, b"bad"]),
        Err(Error::Parse(_))
    ));
    assert!(matches!(store.preview(UID, SERVER, &[]), Err(Error::Empty)));
    assert!(matches!(
        store.preview(
            UID,
            SERVER,
            &[include_bytes!("../fixtures/hsr-api/empty.json")]
        ),
        Err(Error::Empty)
    ));
    let oversized = vec![b' '; 16 * 1024 * 1024 + 1];
    assert!(matches!(
        store.preview(UID, SERVER, &[&oversized]),
        Err(Error::TooLarge)
    ));
    assert!(store.history(UID, SERVER).unwrap().is_empty());
}

#[test]
fn isolates_accounts_servers_and_game_namespace() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let other = page(|p| {
        for r in p["data"]["list"].as_array_mut().unwrap() {
            r["uid"] = json!("100000003");
        }
    });
    let preview = store.preview("100000003", SERVER, &[&other]).unwrap();
    store.commit(preview, 1234).unwrap();
    let no_region = page(|p| {
        p["data"].as_object_mut().unwrap().remove("region");
    });
    let preview = store
        .preview(UID, "resolved-other-server", &[&no_region])
        .unwrap();
    store.commit(preview, 1234).unwrap();
    assert_eq!(store.history(UID, SERVER).unwrap().len(), 2);
    assert_eq!(store.history("100000003", SERVER).unwrap().len(), 2);
    assert_eq!(
        store.history(UID, "resolved-other-server").unwrap().len(),
        2
    );
    assert!(store.history("100000004", SERVER).unwrap().is_empty());
    assert_eq!(
        db.connection()
            .query_row("SELECT DISTINCT game FROM rolls", [], |r| r
                .get::<_, String>(0))
            .unwrap(),
        "honkai-star-rail"
    );
}

#[test]
fn stale_previews_and_previews_from_other_databases_cannot_commit() {
    let db = Database::new();
    let mut store = db.store();
    let stale = store.preview(UID, SERVER, &[PAGE]).unwrap();
    import(&mut db.store(), PAGE);
    assert_eq!(store.commit(stale, 1234), Err(Error::StalePreview));
    let other = Database::new();
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    assert_eq!(
        other.store().commit(preview, 1234),
        Err(Error::StalePreview)
    );
}

#[test]
fn migration_rejects_unrelated_future_and_corrupt_databases_without_overwriting() {
    for sql in [
        "CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES ('synthetic');",
        "PRAGMA user_version=99;",
        "PRAGMA application_id=123;",
    ] {
        let db = Database::new();
        db.connection().execute_batch(sql).unwrap();
        let before = std::fs::read(&db.0).unwrap();
        assert!(matches!(Store::open(&db.0), Err(Error::Schema)));
        assert_eq!(std::fs::read(&db.0).unwrap(), before);
    }
    let db = Database::new();
    std::fs::write(&db.0, b"synthetic corrupt database").unwrap();
    assert!(matches!(Store::open(&db.0), Err(Error::Database)));
    assert_eq!(std::fs::read(&db.0).unwrap(), b"synthetic corrupt database");
    assert!(matches!(
        Store::open(&db.0.join("missing")),
        Err(Error::Database)
    ));
}

#[test]
fn failed_insert_rolls_back_account_batch_rolls_provenance_and_revision() {
    let db = Database::new();
    let mut store = db.store();
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    db.connection().execute_batch("CREATE TRIGGER reject_second BEFORE INSERT ON rolls WHEN NEW.id='9007199254740992' BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END;").unwrap();
    assert_eq!(store.commit(preview, 1234), Err(Error::Database));
    for table in ["accounts", "rolls", "batches", "batch_rolls"] {
        assert_eq!(
            db.connection()
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    assert_eq!(
        db.connection()
            .query_row("SELECT revision FROM metadata", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    db.connection()
        .execute_batch("DROP TRIGGER reject_second")
        .unwrap();
    assert_eq!(import(&mut store, PAGE), summary(2, 0, 0));
}

#[test]
fn unknown_timezone_stays_unknown_and_changed_evidence_requires_reconciliation() {
    let db = Database::new();
    let mut store = db.store();
    let unknown = page(|p| {
        p["data"]
            .as_object_mut()
            .unwrap()
            .remove("region_time_zone");
    });
    assert_eq!(import(&mut store, &unknown), summary(2, 0, 0));
    assert_eq!(import(&mut store, &unknown), summary(0, 2, 0));
    assert!(matches!(
        store.preview(UID, SERVER, &[PAGE]),
        Err(Error::Context)
    ));
    assert_eq!(
        db.connection()
            .query_row("SELECT timezone FROM accounts", [], |r| r
                .get::<_, Option<i32>>(0))
            .unwrap(),
        None
    );
    assert_eq!(
        store.history(UID, SERVER).unwrap()[0].time,
        "2024-02-29 12:34:56"
    );
}

#[test]
fn preview_owns_input_and_cancellation_leaves_no_batch() {
    let db = Database::new();
    let mut store = db.store();
    let mut bytes = PAGE.to_vec();
    let preview = store.preview(UID, SERVER, &[&bytes]).unwrap();
    bytes.fill(b'x');
    store.commit(preview, 1234).unwrap();
    assert_eq!(store.history(UID, SERVER).unwrap().len(), 2);
    let cancelled = store.preview(UID, SERVER, &[PAGE]).unwrap();
    drop(cancelled);
    assert_eq!(
        db.connection()
            .query_row("SELECT count(*) FROM batches", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn database_uniqueness_foreign_keys_and_game_isolation_are_enforced() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let conn = db.connection();
    conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    assert!(
        conn.execute_batch("INSERT INTO rolls SELECT * FROM rolls LIMIT 1")
            .is_err()
    );
    assert!(
        conn.execute_batch(
            "INSERT INTO rolls VALUES ('genshin-impact','synthetic','synthetic','1','{}')"
        )
        .is_err()
    );
    conn.execute_batch("INSERT INTO accounts SELECT 'genshin-impact',uid,server,timezone FROM accounts; INSERT INTO rolls SELECT 'genshin-impact',uid,server,id,payload FROM rolls WHERE game='honkai-star-rail'").unwrap();
    assert_eq!(store.history(UID, SERVER).unwrap().len(), 2);
    assert_eq!(
        conn.query_row("SELECT count(*) FROM rolls", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        4
    );
}

#[test]
fn database_and_decode_errors_are_safe_and_failed_previews_do_not_write() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    db.connection()
        .execute_batch("UPDATE rolls SET payload='{}'")
        .unwrap();
    assert_eq!(store.history(UID, SERVER), Err(Error::InvalidStoredData));
    db.connection()
        .execute_batch("PRAGMA foreign_keys=OFF; DROP TABLE rolls")
        .unwrap();
    assert!(matches!(
        store.preview(UID, SERVER, &[PAGE]),
        Err(Error::Database)
    ));
    assert_eq!(store.history(UID, SERVER), Err(Error::Database));
    assert_eq!(format!("{:?}", store.history(UID, SERVER)), "Err(Database)");
}

#[test]
fn locked_database_rejects_commit_and_rolls_back_without_partial_writes() {
    let db = Database::new();
    let mut store = db.store();
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    let blocker = db.connection();
    blocker.execute_batch("BEGIN IMMEDIATE").unwrap();
    assert_eq!(store.commit(preview, 1234), Err(Error::Database));
    blocker.execute_batch("ROLLBACK").unwrap();
    assert!(store.history(UID, SERVER).unwrap().is_empty());
    assert_eq!(import(&mut store, PAGE), summary(2, 0, 0));
}

#[test]
fn commit_rechecks_payloads_even_if_external_writer_did_not_update_revision() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    db.connection()
        .execute_batch("UPDATE rolls SET payload=json_set(payload,'$.name','changed externally')")
        .unwrap();
    assert_eq!(store.commit(preview, 1234), Err(Error::StalePreview));
    assert_eq!(
        db.connection()
            .query_row("SELECT count(*) FROM batches", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn failure_at_transaction_commit_rolls_back_every_table() {
    let db = Database::new();
    let mut store = db.store();
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    db.connection().execute_batch("CREATE TABLE deferred_parent(id INTEGER PRIMARY KEY); CREATE TABLE deferred_child(id INTEGER REFERENCES deferred_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_commit AFTER INSERT ON rolls BEGIN INSERT INTO deferred_child VALUES(1); END;").unwrap();
    assert_eq!(store.commit(preview, 1234), Err(Error::Database));
    for table in [
        "accounts",
        "rolls",
        "batches",
        "batch_rolls",
        "deferred_child",
    ] {
        assert_eq!(
            db.connection()
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    assert_eq!(
        db.connection()
            .query_row("SELECT revision FROM metadata", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn records_the_callers_import_time_without_reading_the_system_clock() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let saved: String = db
        .connection()
        .query_row("SELECT CAST(imported_at AS TEXT) FROM batches", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(saved, "1234");
}

#[test]
fn commit_rechecks_account_timezone_evidence() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
    db.connection()
        .execute_batch("UPDATE accounts SET timezone=-5")
        .unwrap();
    assert_eq!(store.commit(preview, 1234), Err(Error::Context));
    assert_eq!(
        db.connection()
            .query_row("SELECT count(*) FROM batches", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}
