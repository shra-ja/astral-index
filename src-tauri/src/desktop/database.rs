//! The local history database, opened on first use in the local app data folder
//! ([decision 0009](../../../docs/decisions/0009-local-database-location.md)).
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::storage::{Error, Store};
#[cfg(not(test))]
use std::fs;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, PoisonError},
};

/// The database file inside the local app data folder.
pub const FILE_NAME: &str = "history.sqlite";
/// A folder with this name beside the executable switches on portable mode.
pub const PORTABLE_FOLDER: &str = "data";

/// Where to keep the database: the `data` folder beside the executable if one
/// exists (portable mode), otherwise the local app data folder. A portable
/// database is used even when the local folder also has one; nothing is merged.
pub fn location(executable: Option<&Path>, local: Option<PathBuf>) -> Option<PathBuf> {
    let portable = executable
        .and_then(Path::parent)
        .map(|folder| folder.join(PORTABLE_FOLDER));
    match portable {
        Some(portable) if fs::metadata(&portable).is_ok_and(|metadata| metadata.is_dir()) => {
            Some(portable)
        }
        _ => local,
    }
}

/// Nothing is created or opened until the first `run`.
pub struct Database {
    folder: Option<PathBuf>,
    store: Arc<Mutex<Option<Store>>>,
}
impl Database {
    /// `folder` is the local app data folder, or `None` if the platform gave none.
    pub fn new(folder: Option<PathBuf>) -> Self {
        Self {
            folder,
            store: Arc::default(),
        }
    }
    /// Where the database file is, or would be, kept.
    pub fn path(&self) -> Option<PathBuf> {
        self.folder.as_ref().map(|folder| folder.join(FILE_NAME))
    }
    /// Run `f` with the store on a blocking thread, opening the store first if it
    /// is not open yet. A panic in `f` is reported as a database error.
    pub async fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Store) -> T + Send + 'static,
    ) -> Result<T, Error> {
        let (folder, store) = (self.folder.clone(), Arc::clone(&self.store));
        tokio::task::spawn_blocking(move || with_store(folder.as_deref(), &store, Box::new(f)))
            .await
            .unwrap_or(Err(Error::Database))
    }
}

/// Open the store if needed, then run `f` with it. A panic in `f` drops the store,
/// so the next call reopens it. `f` is boxed so that instantiations differ only by
/// result type, not by closure.
fn with_store<T>(
    folder: Option<&Path>,
    store: &Mutex<Option<Store>>,
    f: Box<dyn FnOnce(&mut Store) -> T + '_>,
) -> Result<T, Error> {
    let mut guard = store.lock().unwrap_or_else(PoisonError::into_inner);
    let mut open = match guard.take() {
        Some(open) => open,
        None => {
            let folder = folder.ok_or(Error::Database)?;
            fs::create_dir_all(folder).map_err(|_| Error::Database)?;
            Store::open(&folder.join(FILE_NAME))?
        }
    };
    let result = f(&mut open);
    *guard = Some(open);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture};
    use crate::storage::tests::database::{self as sql, Reply, Step};
    use crate::storage::tests::{setup, step, text};
    use std::future::Future;

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    fn folder() -> PathBuf {
        PathBuf::from("/data/com.example")
    }
    fn open(path: &Path) -> Step {
        step("OPEN", vec![text(&path.to_string_lossy())], Reply::Done)
    }
    /// The scripted SQL for opening an existing, compatible database.
    fn opening(path: &Path) -> Vec<Step> {
        let mut steps = vec![open(path)];
        steps.extend(setup(true));
        steps
    }

    #[test]
    fn a_data_folder_beside_the_executable_switches_on_portable_mode() {
        let executable = Path::new("/apps/roll-tracker/roll-tracker.exe");
        let data = PathBuf::from("/apps/roll-tracker/data");
        let local = || Some(PathBuf::from("/local/com.example"));
        filesystem::install(Fixture {
            directories: vec![data.clone()],
            ..Default::default()
        });
        assert_eq!(location(Some(executable), local()), Some(data.clone()));
        // Without that folder, or with a file of that name, the local folder is used.
        filesystem::install(Fixture::default());
        assert_eq!(location(Some(executable), local()), local());
        filesystem::install(Fixture {
            files: [(data, vec![])].into(),
            ..Default::default()
        });
        assert_eq!(location(Some(executable), local()), local());
        // So it is without a known executable, or one with no folder.
        assert_eq!(location(None, local()), local());
        assert_eq!(location(Some(Path::new("")), local()), local());
    }

    #[test]
    fn opens_on_first_use_in_the_folder_then_reuses_the_store() {
        filesystem::install(Fixture::default());
        let path = folder().join(FILE_NAME);
        sql::expect(opening(&path));
        let store = Mutex::default();
        assert_eq!(with_store(Some(&folder()), &store, Box::new(|_| 1)), Ok(1));
        sql::finish();
        // Already open: no further SQL or filesystem access.
        filesystem::install(Fixture::default());
        assert_eq!(with_store(Some(&folder()), &store, Box::new(|_| 2)), Ok(2));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(Database::new(Some(folder())).path(), Some(path));
    }

    #[test]
    fn a_missing_or_unusable_folder_or_database_is_a_database_error() {
        let store = Mutex::default();
        assert_eq!(
            with_store(None, &store, Box::new(|_| 0)),
            Err(Error::Database)
        );
        assert_eq!(Database::new(None).path(), None);
        // A file occupies the folder's path.
        filesystem::install(Fixture {
            files: [(folder(), vec![])].into(),
            ..Default::default()
        });
        assert_eq!(
            with_store(Some(&folder()), &store, Box::new(|_| 0)),
            Err(Error::Database)
        );
        // The database cannot be opened.
        filesystem::install(Fixture::default());
        let mut failing = open(&folder().join(FILE_NAME));
        failing.reply = Err(rusqlite::Error::InvalidQuery);
        sql::expect(vec![failing]);
        assert_eq!(
            with_store(Some(&folder()), &store, Box::new(|_| 0)),
            Err(Error::Database)
        );
        sql::finish();
    }

    #[test]
    fn runs_off_the_calling_thread_and_reports_panics_as_database_errors() {
        // Open on this thread, whose doubles the blocking thread cannot see.
        filesystem::install(Fixture::default());
        sql::expect(opening(&folder().join(FILE_NAME)));
        let database = Database::new(Some(folder()));
        with_store(Some(&folder()), &database.store, Box::new(|_| 0)).unwrap();
        sql::finish();
        let caller = std::thread::current().id();
        let thread = run(database.run(|_| std::thread::current().id())).unwrap();
        assert_ne!(thread, caller);
        assert_eq!(
            run(database.run::<()>(|_| panic!("synthetic failure"))),
            Err(Error::Database)
        );
    }
}
