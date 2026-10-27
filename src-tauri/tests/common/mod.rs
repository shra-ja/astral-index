//! Helpers shared by the integration tests. Each test crate compiles its own copy and
//! uses only some of them, so the others would be reported as dead code there.
#![allow(dead_code)]

use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

/// A folder of its own for each test, named after the test crate, removed afterwards,
/// even when the test fails.
pub struct Folder(PathBuf);
impl Folder {
    pub fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "astral-index-{}-{}-{}",
            env!("CARGO_CRATE_NAME"),
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    pub fn root(&self) -> &Path {
        &self.0
    }
    pub fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Folder {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

/// The names in a folder, sorted.
pub fn names(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// 1.0.0's database, written by its own `Store` from the synthetic history described
/// in fixtures/storage/README.md; tests read or copy it, never open it in place.
pub fn release_1_0_0() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/storage/history-1.0.0.sqlite")
}

/// Every import's account and counts, in order.
pub fn imports(history: &Path) -> Vec<(String, String, i64, i64, i64)> {
    let connection = Connection::open(history).unwrap();
    let mut batches = connection
        .prepare("SELECT uid,server,imported_at,inserted,duplicates FROM batches ORDER BY id")
        .unwrap();
    batches
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
        .unwrap()
}
