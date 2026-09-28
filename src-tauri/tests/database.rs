//! The desktop database opens real SQLite in a new folder on first use only.
use roll_tracker::desktop::Database;

#[test]
fn creates_the_folder_and_database_on_first_use_then_reuses_them() {
    let root = std::env::temp_dir().join(format!("roll-tracker-database-{}", std::process::id()));
    let folder = root.join("nested").join("app");
    let database = Database::new(Some(folder.clone()));
    assert!(!root.exists(), "nothing is created before first use");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();
    for _ in 0..2 {
        let history = runtime
            .block_on(database.run(|store| store.history("100000001", "synthetic-server")))
            .unwrap()
            .unwrap();
        assert!(history.is_empty());
    }
    assert_eq!(database.path(), Some(folder.join("history.sqlite")));
    assert!(folder.join("history.sqlite").is_file());
    drop(database);
    std::fs::remove_dir_all(root).unwrap();
}
