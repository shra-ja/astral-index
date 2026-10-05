//! The desktop database opens real SQLite in a new folder on first use only.
use astral_index::desktop::Database;

#[test]
fn creates_the_folder_and_database_on_first_use_then_reuses_them() {
    let root = std::env::temp_dir().join(format!("astral-index-database-{}", std::process::id()));
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
    // The work runs on Tokio's blocking pool, and a panic there is a database error.
    let caller = std::thread::current().id();
    let worker = runtime
        .block_on(database.run(|_| std::thread::current().id()))
        .unwrap();
    assert_ne!(worker, caller);
    assert_eq!(
        runtime.block_on(database.run::<()>(|_| panic!("synthetic failure"))),
        Err(astral_index::storage::Error::Database)
    );
    assert!(folder.join("history.sqlite").is_file());
    drop(database);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_data_folder_beside_the_executable_holds_the_portable_database() {
    use astral_index::desktop::database::location;
    let root = std::env::temp_dir().join(format!("astral-index-portable-{}", std::process::id()));
    let data = root.join("data");
    let local = root.join("local");
    std::fs::create_dir_all(&data).unwrap();
    // The executable itself is never read, so a synthetic path suffices.
    let executable = root.join("astral-index.exe");
    let folder = location(Some(&executable), Some(local.clone()));
    assert_eq!(folder, Some(data.clone()));
    let database = Database::new(folder);
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(database.run(|store| store.history("100000001", "synthetic-server")))
        .unwrap()
        .unwrap();
    assert!(data.join("history.sqlite").is_file());
    assert!(
        !local.exists(),
        "the local folder is not used in portable mode"
    );
    drop(database);
    std::fs::remove_dir_all(root).unwrap();
}
