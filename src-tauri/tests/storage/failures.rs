//! Internal fault-injection tests: real SQLite authorization and limits, no fake SQL engine.
use super::*;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization, TransactionOperation};
use rusqlite::limits::Limit;
use std::sync::atomic::{AtomicU64, Ordering};

const PAGE: &[u8] = include_bytes!("../fixtures/hsr-api/page.json");
const UID: &str = "100000002";
const SERVER: &str = "synthetic-server";
static NEXT: AtomicU64 = AtomicU64::new(0);

// Fail selected operations in real SQLite to verify error handling and rollback.
fn deny(connection: &Connection, predicate: impl Fn(AuthAction<'_>) -> bool + Send + 'static) {
    connection
        .authorizer(Some(move |context: AuthContext<'_>| {
            if predicate(context.action) {
                Authorization::Deny
            } else {
                Authorization::Allow
            }
        }))
        .unwrap();
}
fn allow(connection: &Connection) {
    connection
        .authorizer(None::<fn(AuthContext<'_>) -> Authorization>)
        .unwrap();
}
fn empty_store() -> Store {
    Store::initialize(Connection::open_in_memory().unwrap()).unwrap()
}
// Verify that a failed operation leaves neither durable import state nor an open transaction.
fn no_imports(store: &Store) {
    for table in ["accounts", "rolls", "batches"] {
        assert_eq!(
            store
                .connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    assert_eq!(snapshot(&store.connection).unwrap().1, 0);
    assert!(store.connection.is_autocommit());
}

#[test]
fn failed_initialization_never_leaves_a_partial_migration() {
    for stage in [
        "setup",
        "begin",
        "version",
        "application",
        "inventory",
        "migration",
        "snapshot",
        "commit",
    ] {
        let path = std::env::temp_dir().join(format!(
            "roll-tracker-migration-failure-{}-{}.sqlite",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let connection = Connection::open(&path).unwrap();
        deny(&connection, move |action| {
            matches!(
                (stage, action),
                (
                    "setup",
                    AuthAction::Pragma {
                        pragma_name: "busy_timeout",
                        ..
                    },
                ) | (
                    "begin",
                    AuthAction::Transaction {
                        operation: TransactionOperation::Begin,
                    },
                ) | (
                    "version",
                    AuthAction::Pragma {
                        pragma_name: "user_version",
                        pragma_value: None,
                    },
                ) | (
                    "application",
                    AuthAction::Pragma {
                        pragma_name: "application_id",
                        pragma_value: None,
                    },
                ) | (
                    "inventory",
                    AuthAction::Read {
                        table_name: "sqlite_master" | "sqlite_schema",
                        ..
                    },
                ) | (
                    "migration",
                    AuthAction::CreateTable {
                        table_name: "rolls",
                    },
                ) | (
                    "snapshot",
                    AuthAction::Read {
                        table_name: "metadata",
                        ..
                    },
                ) | (
                    "commit",
                    AuthAction::Transaction {
                        operation: TransactionOperation::Unknown,
                    },
                )
            )
        });
        assert!(
            matches!(Store::initialize(connection), Err(Error::Database)),
            "{stage}"
        );
        let inspected = Connection::open(&path).unwrap();
        assert_eq!(
            inspected
                .query_row("SELECT count(*) FROM sqlite_schema", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0,
            "{stage}"
        );
        assert_eq!(
            inspected
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        drop(inspected);
        std::fs::remove_file(path).unwrap();
    }
}

#[test]
fn failed_preview_reads_and_transaction_boundaries_write_nothing() {
    for stage in ["begin", "accounts", "metadata", "commit"] {
        let mut store = empty_store();
        deny(&store.connection, move |action| {
            matches!(
                (stage, action),
                (
                    "begin",
                    AuthAction::Transaction {
                        operation: TransactionOperation::Begin,
                    },
                ) | (
                    "accounts",
                    AuthAction::Read {
                        table_name: "accounts",
                        ..
                    },
                ) | (
                    "metadata",
                    AuthAction::Read {
                        table_name: "metadata",
                        ..
                    },
                ) | (
                    "commit",
                    AuthAction::Transaction {
                        operation: TransactionOperation::Unknown,
                    },
                )
            )
        });
        assert!(
            matches!(store.preview(UID, SERVER, &[PAGE]), Err(Error::Database)),
            "{stage}"
        );
        allow(&store.connection);
        no_imports(&store);
    }
}

#[test]
fn failed_commit_statements_roll_back_the_entire_import() {
    for stage in [
        "metadata",
        "rolls",
        "accounts",
        "batches",
        "roll_insert",
        "revision",
    ] {
        let mut store = empty_store();
        let preview = store.preview(UID, SERVER, &[PAGE]).unwrap();
        deny(&store.connection, move |action| {
            matches!(
                (stage, action),
                (
                    "metadata",
                    AuthAction::Read {
                        table_name: "metadata",
                        ..
                    },
                ) | (
                    "rolls",
                    AuthAction::Read {
                        table_name: "rolls",
                        ..
                    },
                ) | (
                    "accounts",
                    AuthAction::Insert {
                        table_name: "accounts",
                    },
                ) | (
                    "batches",
                    AuthAction::Insert {
                        table_name: "batches",
                    },
                ) | (
                    "roll_insert",
                    AuthAction::Insert {
                        table_name: "rolls",
                    },
                ) | (
                    "revision",
                    AuthAction::Update {
                        table_name: "metadata",
                        ..
                    },
                )
            )
        });
        assert_eq!(store.commit(preview, 1234), Err(Error::Database), "{stage}");
        allow(&store.connection);
        no_imports(&store);
    }
}

#[test]
fn malformed_database_metadata_and_payload_types_fail_safely() {
    for values in ["x'00',0", "'synthetic','not-an-integer'"] {
        let store = empty_store();
        store.connection.execute_batch(&format!("DROP TABLE metadata; CREATE TABLE metadata(singleton,database_id,revision); INSERT INTO metadata VALUES(1,{values});")).unwrap();
        assert_eq!(snapshot(&store.connection), Err(Error::Database));
    }
    let mut store = empty_store();
    store.connection.execute_batch("DROP TABLE rolls; CREATE TABLE rolls(game,uid,server,id,payload); INSERT INTO rolls VALUES('honkai-star-rail','100000002','synthetic-server','9007199254740993',x'00');").unwrap();
    assert_eq!(store.history(UID, SERVER), Err(Error::Database));
    assert!(matches!(
        store.preview(UID, SERVER, &[PAGE]),
        Err(Error::Database)
    ));
}

#[test]
fn parameter_size_limit_errors_are_returned_without_exposing_values() {
    let store = empty_store();
    store
        .connection
        .set_limit(Limit::SQLITE_LIMIT_LENGTH, 1024)
        .unwrap();
    assert_eq!(
        store.history(&"1".repeat(2048), SERVER),
        Err(Error::Database)
    );
    no_imports(&store);
}

#[test]
fn missing_metadata_in_an_existing_schema_is_not_reinitialized() {
    let store = empty_store();
    store
        .connection
        .execute_batch("DELETE FROM metadata")
        .unwrap();
    assert!(matches!(
        Store::initialize(store.connection),
        Err(Error::Database)
    ));
}
