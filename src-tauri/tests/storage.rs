use astral_index::acquisition::Category;
use astral_index::storage::{
    Account, CategorySummary, Error, Filter, HistoryPage, LastImport, Rarities, SavedAccount,
    Source, Store, Summary,
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
const PAGE: &[u8] = include_bytes!("fixtures/hsr-api/page.json");
const UID: &str = "100000002";
const SERVER: &str = "synthetic-server";
static NEXT: AtomicU64 = AtomicU64::new(0);
// Own an isolated on-disk database and its cleanup for persistence and rollback tests.
struct Database(PathBuf);
impl Database {
    // Give parallel tests independent directories without touching application data.
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "astral-index-storage-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path.join("history.sqlite"))
    }
    fn store(&self) -> Store {
        Store::open(&self.0).unwrap()
    }
    // Inspect or perturb durable state independently of the service under test.
    fn connection(&self) -> Connection {
        Connection::open(&self.0).unwrap()
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}
// Derive a focused input variation while preserving the rest of the valid synthetic page.
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
// Exercise the normal preview/commit flow with fixed context and time.
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
    let expected = astral_index::parse_response(&bytes).unwrap();
    assert_eq!(stored.len(), 2);
    assert!(expected.list.iter().all(|r| stored.contains(r)));
    let conn = db.connection();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM batches", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        scalar(&conn, "SELECT count(*) FROM rolls WHERE first_batch=1"),
        2
    );
    assert_eq!(scalar(&conn, "SELECT inserted FROM batches"), 2);
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM pragma_table_info('batches') WHERE name='pages'"
        ),
        0
    );
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM sqlite_schema WHERE name='batch_rolls'"
        ),
        0
    );
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
            &[include_bytes!("fixtures/hsr-api/empty.json")]
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
    for table in ["accounts", "rolls", "batches"] {
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
            "INSERT INTO rolls VALUES ('genshin-impact','synthetic','synthetic','1','{}',1)"
        )
        .is_err()
    );
    conn.execute_batch("INSERT INTO accounts SELECT 'genshin-impact',uid,server,timezone FROM accounts; INSERT INTO batches SELECT 2,'genshin-impact',uid,server,adapter,imported_at,inserted,duplicates,conflicts FROM batches WHERE id=1; INSERT INTO rolls SELECT 'genshin-impact',uid,server,id,payload,2 FROM rolls WHERE game='honkai-star-rail'").unwrap();
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
    for table in ["accounts", "rolls", "batches", "deferred_child"] {
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

fn scalar(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

#[test]
fn duplicate_imports_only_add_summaries_and_keep_first_provenance() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    let conn = db.connection();
    conn.execute_batch("CREATE TRIGGER no_repeat BEFORE INSERT ON rolls WHEN EXISTS(SELECT 1 FROM rolls WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'duplicate write'); END;").unwrap();
    for _ in 0..20 {
        assert_eq!(import(&mut store, PAGE), summary(0, 2, 0));
    }
    assert_eq!(
        scalar(&conn, "SELECT count(*) FROM rolls WHERE first_batch=1"),
        2
    );
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM batches WHERE inserted=0 AND duplicates=2 AND conflicts=0 AND adapter='hsr-api-v1'"
        ),
        20
    );
    let overlap = page(|p| p["data"]["list"][1]["id"] = json!("0007199254740991"));
    assert_eq!(import(&mut store, &overlap), summary(1, 1, 0));
    assert_eq!(
        scalar(
            &conn,
            "SELECT first_batch FROM rolls WHERE id='0007199254740991'"
        ),
        22
    );
}

#[test]
fn initial_schema_creates_compact_storage_directly() {
    let db = Database::new();
    let conn = db.connection();
    conn.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    assert_eq!(scalar(&conn, "PRAGMA user_version"), 2);
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM pragma_table_info('rolls') WHERE name='first_batch'"
        ),
        1
    );
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM pragma_table_info('batches') WHERE name='pages'"
        ),
        0
    );
    assert_eq!(
        scalar(
            &conn,
            "SELECT count(*) FROM sqlite_schema WHERE name='batch_rolls'"
        ),
        0
    );
    let before = std::fs::read(&db.0).unwrap();
    db.store();
    assert_eq!(std::fs::read(&db.0).unwrap(), before);
}

#[test]
fn obsolete_prerelease_schema_is_rejected_without_modification() {
    let db = Database::new();
    db.connection().execute_batch("PRAGMA application_id=1381257795; PRAGMA user_version=1; CREATE TABLE metadata(singleton,database_id,revision); INSERT INTO metadata VALUES(1,'synthetic',0);").unwrap();
    let before = std::fs::read(&db.0).unwrap();
    assert!(matches!(Store::open(&db.0), Err(Error::Schema)));
    assert_eq!(std::fs::read(&db.0).unwrap(), before);
}

#[test]
fn rolling_year_imports_grow_with_unique_rolls_and_compact_summaries() {
    use std::time::Instant;
    let db = Database::new();
    let mut store = db.store();
    let conn = db.connection();
    let base = serde_json::from_slice::<Value>(PAGE).unwrap()["data"]["list"][0].clone();
    // 500 synthetic rolls/month, 12 months/window; one page per month.
    let pages: Vec<Vec<u8>> = (0..24)
        .map(|month| {
            page(|p| {
                p["data"]["list"] = Value::Array(
                    (0..500)
                        .map(|index| {
                            let mut roll = base.clone();
                            roll["id"] = json!(format!("{:019}", month * 500 + index + 1));
                            roll["time"] = json!(format!(
                                "{}-{:02}-01 12:00:00",
                                2024 + month / 12,
                                month % 12 + 1
                            ));
                            roll
                        })
                        .collect(),
                );
            })
        })
        .collect();
    let run = |store: &mut Store, start: usize| {
        let bytes: Vec<&[u8]> = pages[start..start + 12].iter().map(Vec::as_slice).collect();
        let preview = store.preview(UID, SERVER, &bytes).unwrap();
        store.commit(preview, 1234).unwrap()
    };
    let began = Instant::now();
    assert_eq!(run(&mut store, 0), summary(6000, 0, 0));
    let initial_time = began.elapsed();
    let initial_size = std::fs::metadata(&db.0).unwrap().len();
    let began = Instant::now();
    for _ in 0..24 {
        assert_eq!(run(&mut store, 0), summary(0, 6000, 0));
    }
    let repeats_time = began.elapsed();
    let repeats_size = std::fs::metadata(&db.0).unwrap().len();
    assert_eq!(
        scalar(&conn, "SELECT count(*) FROM rolls WHERE first_batch=1"),
        6000
    );
    assert_eq!(scalar(&conn, "SELECT count(*) FROM batches"), 25);
    assert!(
        repeats_size - initial_size <= 32 * 1024,
        "duplicate-only growth: {}",
        repeats_size - initial_size
    );
    let began = Instant::now();
    for start in 1..=12 {
        assert_eq!(run(&mut store, start), summary(500, 5500, 0));
    }
    let rolling_time = began.elapsed();
    let final_size = std::fs::metadata(&db.0).unwrap().len();
    assert_eq!(scalar(&conn, "SELECT count(*) FROM rolls"), 12000);
    assert_eq!(scalar(&conn, "SELECT sum(inserted) FROM batches"), 12000);
    assert_eq!(scalar(&conn, "SELECT sum(duplicates) FROM batches"), 210000);
    assert_eq!(scalar(&conn, "SELECT count(*) FROM batches"), 37);
    assert!(final_size <= 2 * initial_size + 64 * 1024);
    let mut conflict: Value = serde_json::from_slice(&pages[23]).unwrap();
    conflict["data"]["list"][0]["name"] = json!("changed synthetic name");
    let conflict = serde_json::to_vec(&conflict).unwrap();
    let before = std::fs::read(&db.0).unwrap();
    let began = Instant::now();
    let preview = store.preview(UID, SERVER, &[&conflict]).unwrap();
    assert_eq!(preview.summary(), summary(0, 499, 1));
    assert_eq!(store.commit(preview, 1234), Err(Error::Conflict));
    let conflict_time = began.elapsed();
    assert_eq!(std::fs::read(&db.0).unwrap(), before);
    drop(store);
    assert_eq!(db.store().history(UID, SERVER).unwrap().len(), 12000);
    println!(
        "initial={initial_time:?}; 24 repeats={repeats_time:?}; 12 rolling={rolling_time:?}; conflict={conflict_time:?}; database bytes={initial_size}/{repeats_size}/{final_size}"
    );
}

#[test]
fn precise_extensions_survive_restart_and_conflict_on_changed_values() {
    let db = Database::new();
    let a = include_bytes!("fixtures/hsr-api/numeric-extensions-a.json");
    let b = include_bytes!("fixtures/hsr-api/numeric-extensions-b.json");
    assert_eq!(import(&mut db.store(), a), summary(2, 0, 0));
    let mut store = db.store();
    let stored = serde_json::to_string(&store.history(UID, SERVER).unwrap()).unwrap();
    assert!(stored.contains("18446744073709551616"));
    assert!(stored.contains("0.123456789012345678901"));
    let preview = store.preview(UID, SERVER, &[b]).unwrap();
    assert_eq!(preview.summary(), summary(0, 1, 1));
    assert_eq!(store.commit(preview, 1234), Err(Error::Conflict));
}

#[test]
fn corrupt_payload_identity_and_domain_values_never_escape_history_queries() {
    for (field, value) in [
        ("uid", "100000003"),
        ("id", "999"),
        ("rank_type", "9"),
        ("time", "2024-02-30 12:00:00"),
    ] {
        let db = Database::new();
        import(&mut db.store(), PAGE);
        // Corrupt the last row so a valid earlier row cannot leak as a partial result.
        db.connection()
            .execute(
                "UPDATE rolls SET payload=json_set(payload,?1,?2) WHERE id='9007199254740993'",
                rusqlite::params![format!("$.{field}"), value],
            )
            .unwrap();
        assert_eq!(
            db.store().history(UID, SERVER),
            Err(Error::InvalidStoredData),
            "{field}"
        );
    }
}

#[test]
fn page_timezone_evidence_must_agree_even_on_empty_terminal_pages() {
    let db = Database::new();
    let mut store = db.store();
    let unknown = page(|p| {
        p["data"]
            .as_object_mut()
            .unwrap()
            .remove("region_time_zone");
    });
    let empty_known = page(|p| p["data"]["list"] = json!([]));
    let empty_unknown = page(|p| {
        p["data"]["list"] = json!([]);
        p["data"]
            .as_object_mut()
            .unwrap()
            .remove("region_time_zone");
    });
    for pages in [
        vec![PAGE, unknown.as_slice()],
        vec![unknown.as_slice(), PAGE],
        vec![PAGE, empty_unknown.as_slice()],
        vec![unknown.as_slice(), empty_known.as_slice()],
    ] {
        assert!(matches!(
            store.preview(UID, SERVER, &pages),
            Err(Error::Context)
        ));
        assert!(store.history(UID, SERVER).unwrap().is_empty());
    }
    assert_eq!(
        store
            .preview(UID, SERVER, &[PAGE, &empty_known])
            .unwrap()
            .summary(),
        summary(2, 0, 0)
    );
    assert_eq!(
        store
            .preview(UID, SERVER, &[&unknown, &empty_unknown])
            .unwrap()
            .summary(),
        summary(2, 0, 0)
    );
}

#[test]
fn ambiguous_stored_json_is_rejected_before_deserialization() {
    let db = Database::new();
    let mut store = db.store();
    import(&mut store, PAGE);
    db.connection()
        .execute(
            "UPDATE rolls SET payload=?1",
            [r#"{"uid":"100000003","uid":"100000002"}"#],
        )
        .unwrap();
    assert_eq!(store.history(UID, SERVER), Err(Error::InvalidStoredData));
}

#[test]
fn saved_accounts_count_each_accounts_rolls_and_list_the_newest_import_first() {
    let db = Database::new();
    let mut store = db.store();
    assert_eq!(store.accounts().unwrap(), vec![]);
    assert_eq!(store.account(UID, SERVER).unwrap(), None);
    let fixture_rolls = page(|_| {});
    let fixture_count = serde_json::from_slice::<Value>(&fixture_rolls).unwrap()["data"]["list"]
        .as_array()
        .unwrap()
        .len();
    import(&mut store, &fixture_rolls);
    let other = page(|p| {
        let list = p["data"]["list"].as_array_mut().unwrap();
        list.truncate(2);
        for roll in list {
            roll["uid"] = json!("100000003");
        }
        p["data"]
            .as_object_mut()
            .unwrap()
            .remove("region_time_zone");
    });
    let preview = store.preview("100000003", SERVER, &[&other]).unwrap();
    store.commit(preview, 1235).unwrap();
    let saved = |uid: &str, timezone, rolls| SavedAccount {
        uid: uid.into(),
        server: SERVER.into(),
        timezone,
        rolls,
    };
    assert_eq!(
        store.accounts().unwrap(),
        vec![
            saved("100000003", None, 2),
            saved(UID, Some(8), fixture_count)
        ]
    );
    // Importing into the first account again moves it to the front, even when
    // nothing new was saved.
    import(&mut store, &fixture_rolls);
    assert_eq!(
        store.accounts().unwrap(),
        vec![
            saved(UID, Some(8), fixture_count),
            saved("100000003", None, 2)
        ]
    );
    assert_eq!(
        store.account(UID, SERVER).unwrap(),
        Some(Account {
            uid: UID.into(),
            server: SERVER.into(),
            timezone: Some(8)
        })
    );
    assert_eq!(
        store
            .account("100000003", SERVER)
            .unwrap()
            .unwrap()
            .timezone,
        None
    );
    // The same UID on another server is another account.
    assert_eq!(store.account(UID, "another-server").unwrap(), None);
}

#[test]
fn a_page_summarises_its_whole_category_by_rarity_and_period() {
    let db = Database::new();
    let mut store = db.store();
    let rolls = [
        ("1000000000000000001", "11", "3", "2026-09-27 10:00:00"),
        ("1000000000000000002", "11", "4", "2026-09-28 21:14:03"),
        ("1000000000000000003", "11", "5", "2026-09-26 08:30:00"),
        ("1000000000000000004", "11", "5", "2026-09-29 12:00:00"),
        ("1000000000000000005", "11", "3", "2026-09-29 11:59:59"),
        ("1000000000000000006", "1", "5", "2026-09-30 12:00:00"),
    ];
    let bytes = page(|p| {
        let template = p["data"]["list"][0].clone();
        p["data"]["list"] = rolls
            .iter()
            .map(|(id, gacha_type, rank_type, time)| {
                let mut roll = template.clone();
                roll["id"] = json!(id);
                roll["gacha_type"] = json!(gacha_type);
                roll["rank_type"] = json!(rank_type);
                roll["time"] = json!(time);
                roll
            })
            .collect();
    });
    import(&mut store, &bytes);
    // The summary covers the whole category, whichever page is read.
    for offset in [0, 2] {
        let page = store
            .page(
                UID,
                SERVER,
                Category::CharacterEvent,
                &Filter::default(),
                offset,
                2,
            )
            .unwrap();
        assert_eq!(
            page.summary,
            CategorySummary {
                five_star: 2,
                four_star: 1,
                first: Some("2026-09-26 08:30:00".into()),
                last: Some("2026-09-29 12:00:00".into()),
            }
        );
    }
    let departure = store
        .page(UID, SERVER, Category::Departure, &Filter::default(), 0, 20)
        .unwrap();
    assert_eq!(departure.summary, CategorySummary::default());
    // Filters hide rolls before paging; shown rolls keep their category numbers.
    let shown = |five, four, three, offset, limit| {
        let page = store
            .page(
                UID,
                SERVER,
                Category::CharacterEvent,
                &Filter {
                    rarities: Rarities { five, four, three },
                    name: String::new(),
                },
                offset,
                limit,
            )
            .unwrap();
        let rolls: Vec<_> = page
            .rolls
            .iter()
            .map(|roll| (roll.number, roll.rank_type.clone()))
            .collect();
        (page.total, page.matched, rolls)
    };
    // Oldest first, the category runs 5★ 3★ 4★ 3★ 5★, numbered 1 to 5.
    assert_eq!(
        shown(true, false, false, 0, 20),
        (5, 2, vec![(5, "5".into()), (1, "5".into())])
    );
    assert_eq!(
        shown(false, true, true, 1, 2),
        (5, 3, vec![(3, "4".into()), (2, "3".into())])
    );
    assert_eq!(shown(false, false, false, 0, 20), (5, 0, vec![]));
}

#[test]
fn item_search_matches_names_ignoring_case_in_any_script() {
    let db = Database::new();
    let mut store = db.store();
    let rolls = [
        ("1000000000000000001", "Кафка", "5", "2026-09-26 08:30:00"),
        ("1000000000000000002", "Éclair", "4", "2026-09-27 10:00:00"),
        ("1000000000000000003", "Arrows", "3", "2026-09-28 21:14:03"),
        ("1000000000000000004", "Кафка", "5", "2026-09-29 12:00:00"),
    ];
    let bytes = page(|p| {
        let template = p["data"]["list"][0].clone();
        p["data"]["list"] = rolls
            .iter()
            .map(|(id, name, rank_type, time)| {
                let mut roll = template.clone();
                roll["id"] = json!(id);
                roll["gacha_type"] = json!("11");
                roll["name"] = json!(name);
                roll["rank_type"] = json!(rank_type);
                roll["time"] = json!(time);
                roll
            })
            .collect();
    });
    import(&mut store, &bytes);
    let search = |name: &str, five: bool| {
        let filter = Filter {
            rarities: Rarities {
                five,
                four: true,
                three: true,
            },
            name: name.into(),
        };
        let page = store
            .page(UID, SERVER, Category::CharacterEvent, &filter, 0, 20)
            .unwrap();
        let rolls: Vec<_> = page
            .rolls
            .iter()
            .map(|roll| (roll.number, roll.name.clone()))
            .collect();
        (page.matched, rolls)
    };
    assert_eq!(
        search("КАФ", true),
        (2, vec![(4, "Кафка".into()), (1, "Кафка".into())])
    );
    assert_eq!(search(" éCLAIR ", true), (1, vec![(2, "Éclair".into())]));
    assert_eq!(
        search("a", false),
        (2, vec![(3, "Arrows".into()), (2, "Éclair".into())])
    );
    assert_eq!(search("Kafka", true), (0, vec![]));
}

#[test]
fn pages_list_one_category_newest_first_by_time_then_numeric_id() {
    let db = Database::new();
    let mut store = db.store();
    assert_eq!(store.latest_account().unwrap(), None);
    assert_eq!(store.last_import().unwrap(), None);
    // Same-second rolls order by numeric ID, so a longer ID is newer.
    let rolls = [
        ("1000000000000000000", "11", "2026-09-28 21:14:03"),
        ("999999999999999999", "11", "2026-09-28 21:14:03"),
        ("1000000000000000005", "11", "2026-09-27 10:00:00"),
        ("1000000000000000009", "11", "2026-09-29 08:30:00"),
        ("1000000000000000010", "1", "2026-09-30 12:00:00"),
    ];
    let bytes = page(|p| {
        let template = p["data"]["list"][0].clone();
        p["data"]["list"] = rolls
            .iter()
            .map(|(id, gacha_type, time)| {
                let mut roll = template.clone();
                roll["id"] = json!(id);
                roll["gacha_type"] = json!(gacha_type);
                roll["time"] = json!(time);
                roll
            })
            .collect();
    });
    import(&mut store, &bytes);
    let listed = |offset, limit| {
        let page = store
            .page(
                UID,
                SERVER,
                Category::CharacterEvent,
                &Filter::default(),
                offset,
                limit,
            )
            .unwrap();
        let rolls: Vec<_> = page
            .rolls
            .iter()
            .map(|roll| (roll.number, roll.id.clone()))
            .collect();
        (page.total, rolls)
    };
    assert_eq!(
        listed(0, 2),
        (
            4,
            vec![
                (4, "1000000000000000009".into()),
                (3, "1000000000000000000".into())
            ]
        )
    );
    assert_eq!(
        listed(2, 2),
        (
            4,
            vec![
                (2, "999999999999999999".into()),
                (1, "1000000000000000005".into())
            ]
        )
    );
    assert_eq!(listed(4, 2), (4, vec![]));
    let stellar = store
        .page(UID, SERVER, Category::Stellar, &Filter::default(), 0, 20)
        .unwrap();
    assert_eq!((stellar.total, stellar.rolls.len()), (1, 1));
    // Every page counts each category of the account, empty ones included.
    let counts: Vec<_> = stellar
        .categories
        .iter()
        .map(|category| (category.gacha_type, category.total))
        .collect();
    assert_eq!(
        counts,
        [
            ("1", 1),
            ("2", 0),
            ("11", 4),
            ("12", 0),
            ("21", 0),
            ("22", 0)
        ]
    );
    // Another account's history stays apart, and becomes the latest once imported.
    assert_eq!(
        store
            .page(
                "100000003",
                SERVER,
                Category::CharacterEvent,
                &Filter::default(),
                0,
                20
            )
            .unwrap(),
        HistoryPage::empty()
    );
    assert_eq!(
        store.latest_account().unwrap(),
        Some(Account {
            uid: UID.into(),
            server: SERVER.into(),
            timezone: Some(8)
        })
    );
    let other = page(|p| {
        for roll in p["data"]["list"].as_array_mut().unwrap() {
            roll["uid"] = json!("100000003");
        }
    });
    assert_eq!(
        store.last_import().unwrap(),
        Some(LastImport {
            imported_at: 1234,
            source: Source::Hoyoverse,
            uid: UID.into(),
            server: SERVER.into(),
            inserted: 5,
        })
    );
    let preview = store.preview("100000003", SERVER, &[&other]).unwrap();
    store.commit(preview, 1235).unwrap();
    assert_eq!(store.latest_account().unwrap().unwrap().uid, "100000003");
    // Saved rolls are found per account: the other account's IDs are its own.
    let saved = store.saved_rolls().unwrap();
    assert!(saved.any(UID, SERVER, ["1000000000000000009"].into_iter()));
    assert!(!saved.any(UID, SERVER, ["1"].into_iter()));
    assert!(!saved.any(
        "100000003",
        "another-server",
        ["1000000000000000009"].into_iter()
    ));
    // The newest import is the other account's, with its own count.
    let last = store.last_import().unwrap().unwrap();
    assert_eq!((last.imported_at, last.uid.as_str()), (1235, "100000003"));
    assert!(last.inserted > 0);
}
