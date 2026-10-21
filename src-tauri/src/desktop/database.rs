//! The local history database, opened on first use in the app's local data folder
//! ([decision 0009](../../../docs/architecture/decisions/0009-local-database-location.md)).
#[cfg(test)]
use super::tests::blocking::spawn_blocking;
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::storage::{Error, Store};
#[cfg(not(test))]
use std::fs;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, PoisonError},
};
#[cfg(not(test))]
use tokio::task::spawn_blocking;

/// The database file inside the app's folder.
pub const FILE_NAME: &str = "history.sqlite";
/// A folder with this name beside the executable switches on portable mode.
pub const PORTABLE_FOLDER: &str = "data";
/// The app's folder inside the platform's local data folder, named as the
/// platform's own folders usually are.
#[cfg(target_os = "linux")]
pub const FOLDER_NAME: &str = "astral-index";
#[cfg(not(target_os = "linux"))]
pub const FOLDER_NAME: &str = "Astral-Index";
/// The mock debug binary's own folder, so synthetic history never mixes with real
/// history ([decision 0014](../../../docs/architecture/decisions/0014-mock-debug-binary.md)).
#[cfg(target_os = "linux")]
pub const MOCK_FOLDER_NAME: &str = "astral-index-mock";
#[cfg(not(target_os = "linux"))]
pub const MOCK_FOLDER_NAME: &str = "Astral-Index-Mock";

/// Where the webview keeps its profile within the app's folder. WebView2 makes its
/// own `EBWebView` folder inside the one it is given.
#[cfg(windows)]
pub fn webview_folder(folder: &Path) -> PathBuf {
    folder.to_path_buf()
}
/// WebKit writes its storage folders straight into the one it is given, so give
/// it its own.
#[cfg(not(windows))]
pub fn webview_folder(folder: &Path) -> PathBuf {
    folder.join("webview")
}

/// The webview's own profile folder, which holds nothing but its caches and
/// storage. On Windows the webview is given the app's folder, which also holds the
/// database, and makes `EBWebView` inside it.
#[cfg(windows)]
pub fn webview_profile(folder: &Path) -> PathBuf {
    folder.join("EBWebView")
}
#[cfg(not(windows))]
pub fn webview_profile(folder: &Path) -> PathBuf {
    webview_folder(folder)
}

/// Remove the webview's profile, so the next window starts with nothing cached.
/// The app keeps nothing in webview storage, and a profile that is already gone is
/// fine.
pub fn clear_webview_profile(folder: &Path) {
    let _ = fs::remove_dir_all(webview_profile(folder));
}

/// Whether `folder` is the portable `data` folder beside the executable.
pub fn portable(executable: Option<&Path>, folder: Option<&Path>) -> bool {
    let beside = executable
        .and_then(Path::parent)
        .map(|parent| parent.join(PORTABLE_FOLDER));
    folder.is_some() && folder == beside.as_deref()
}

/// Where to keep the database: the `data` folder beside the executable if one
/// exists (portable mode), otherwise the app's local data folder. A portable
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
    /// `folder` is the app's folder, or `None` if the platform gave none.
    pub fn new(folder: Option<PathBuf>) -> Self {
        Self {
            folder,
            store: Arc::default(),
        }
    }
    /// The app's data folder, which holds the database and the files kept beside
    /// it, or `None` if the platform gave none.
    pub fn folder(&self) -> Option<&Path> {
        self.folder.as_deref()
    }
    /// Where the database file is, or would be, kept.
    pub fn path(&self) -> Option<PathBuf> {
        self.folder.as_deref().map(history_file)
    }
    /// Run `f` with the store on a blocking thread, opening the store first if it
    /// is not open yet. A panic in `f` is reported as a database error.
    pub async fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Store) -> T + Send + 'static,
    ) -> Result<T, Error> {
        let (folder, store) = (self.folder.clone(), Arc::clone(&self.store));
        spawn_blocking(move || with_store(folder.as_deref(), &store, Box::new(f)))
            .await
            .unwrap_or(Err(Error::Database))
    }
    /// Hand `f` the store and the path of its file while nothing else can use the
    /// store, so that `f` can close it and replace the file; the next `run` opens
    /// the file again. `f` must drop the store before it touches the file, as
    /// Windows cannot replace a file that is open. A panic in `f` is reported as a
    /// database error.
    pub async fn replace<T: Send + 'static>(
        &self,
        f: impl FnOnce(Store, &Path) -> T + Send + 'static,
    ) -> Result<T, Error> {
        let (folder, store) = (self.folder.clone(), Arc::clone(&self.store));
        spawn_blocking(move || with_file(folder.as_deref(), &store, Box::new(f)))
            .await
            .unwrap_or(Err(Error::Database))
    }
}

/// The database file in `folder`.
fn history_file(folder: &Path) -> PathBuf {
    folder.join(FILE_NAME)
}

/// The open store, or else the store opened from the database file in `folder`.
fn take_or_open(folder: Option<&Path>, open: Option<Store>) -> Result<Store, Error> {
    match open {
        Some(open) => Ok(open),
        None => {
            let folder = folder.ok_or(Error::Database)?;
            fs::create_dir_all(folder).map_err(|_| Error::Database)?;
            Store::open(&history_file(folder))
        }
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
    let mut open = take_or_open(folder, guard.take())?;
    let result = f(&mut open);
    *guard = Some(open);
    Ok(result)
}

/// Work given the store and the path of its file, which may replace the file.
type Replacement<'a, T> = Box<dyn FnOnce(Store, &Path) -> T + 'a>;

/// Open the store if needed, then hand it and its file to `f`, holding the lock so
/// nothing else uses the store meanwhile. The store is not kept.
fn with_file<T>(
    folder: Option<&Path>,
    store: &Mutex<Option<Store>>,
    f: Replacement<'_, T>,
) -> Result<T, Error> {
    let file = history_file(folder.ok_or(Error::Database)?);
    let mut guard = store.lock().unwrap_or_else(PoisonError::into_inner);
    let open = take_or_open(folder, guard.take())?;
    Ok(f(open, &file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture};
    use crate::storage::tests::database::{self as sql, Reply, Step};

    #[test]
    fn clearing_the_webview_profile_removes_only_its_own_folder() {
        filesystem::install(Fixture::default());
        let folder = Path::new("/data/astral-index-mock");
        clear_webview_profile(folder);
        // The database beside it is never touched.
        filesystem::inspect(|state| {
            assert_eq!(state.removed, [webview_profile(folder)]);
            assert_ne!(state.removed[0], folder);
        });
    }
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
    fn the_webview_profile_sits_in_its_own_folder_beside_the_history() {
        #[cfg(target_os = "linux")]
        assert_eq!(
            (FOLDER_NAME, MOCK_FOLDER_NAME),
            ("astral-index", "astral-index-mock")
        );
        #[cfg(not(target_os = "linux"))]
        assert_eq!(
            (FOLDER_NAME, MOCK_FOLDER_NAME),
            ("Astral-Index", "Astral-Index-Mock")
        );
        let folder = Path::new("/local/astral-index");
        // WebView2 makes its own folder inside the one it is given; WebKit does not.
        #[cfg(windows)]
        assert_eq!(
            (webview_folder(folder), webview_profile(folder)),
            (folder.to_path_buf(), folder.join("EBWebView"))
        );
        #[cfg(not(windows))]
        assert_eq!(webview_folder(folder), folder.join("webview"));
    }

    #[test]
    fn a_data_folder_beside_the_executable_switches_on_portable_mode() {
        let executable = Path::new("/apps/astral-index/astral-index.exe");
        let data = PathBuf::from("/apps/astral-index/data");
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
    fn only_the_data_folder_beside_the_executable_is_portable() {
        let executable = Some(Path::new("/apps/astral-index/astral-index.exe"));
        let data = Path::new("/apps/astral-index/data");
        assert!(portable(executable, Some(data)));
        assert!(!portable(
            executable,
            Some(Path::new("/local/astral-index"))
        ));
        assert!(!portable(executable, None));
        assert!(!portable(None, Some(data)));
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
    fn replacing_hands_over_the_store_and_its_file_and_the_next_use_reopens_it() {
        filesystem::install(Fixture::default());
        let path = folder().join(FILE_NAME);
        let mut script = opening(&path);
        script.extend(opening(&path));
        sql::expect(script);
        let database = Database::new(Some(folder()));
        assert_eq!(
            run(database.replace(|_store, file| file.to_owned())),
            Ok(path.clone())
        );
        // Nothing holds the store now, so the next use opens the file again.
        assert!(database.store.lock().unwrap().is_none());
        assert_eq!(run(database.run(|_| 1)), Ok(1));
        sql::finish();
        // An open store is handed over as it is.
        assert_eq!(run(database.replace(|_, _| 2)), Ok(2));
        // Without a folder there is no file to hand over; a panic is a database error.
        assert_eq!(
            run(Database::new(None).replace(|_, _| ())),
            Err(Error::Database)
        );
        sql::expect(opening(&path));
        assert_eq!(
            run(database.replace::<()>(|_, _| panic!("synthetic failure"))),
            Err(Error::Database)
        );
        sql::finish();
    }

    #[test]
    fn runs_the_work_and_reports_a_panic_as_a_database_error() {
        filesystem::install(Fixture::default());
        sql::expect(opening(&folder().join(FILE_NAME)));
        let database = Database::new(Some(folder()));
        assert_eq!(run(database.run(|_| 7)), Ok(7));
        sql::finish();
        // The store is reused, then dropped by the panic.
        assert_eq!(
            run(database.run::<i32>(|_| panic!("synthetic failure"))),
            Err(Error::Database)
        );
        assert!(
            database
                .store
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .is_none()
        );
    }
}
