//! The local history database, opened on first use in the app's local data folder
//! ([decision 0009](../../../docs/architecture/decisions/0009-local-database-location.md)).
use super::local_time;
#[cfg(test)]
use super::tests::blocking::spawn_blocking;
#[cfg(test)]
use crate::acquisition::tests::filesystem as fs;
use crate::storage::{Error, Schema, Store};
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
    schema: Schema,
    store: Arc<Mutex<State>>,
}
/// The history as the app last found it.
#[derive(Default)]
enum State {
    /// Not opened yet, or handed over to be replaced.
    #[default]
    Closed,
    Open(Store),
    /// From an older release, and its upgrade failed; it is not tried again until
    /// the app restarts, so each failure keeps only one copy.
    NotUpgraded(Option<String>),
}
impl Database {
    /// A database opened with the app's schema. `folder` is the app's folder, or
    /// `None` if the platform gave none. The app's registration passes its schema
    /// through `with_schema`, as the mock's may differ.
    pub fn new(folder: Option<PathBuf>) -> Self {
        Self::with_schema(folder, Schema::CURRENT)
    }
    /// A database opened with `schema`: the app's, or for the mock debug binary a
    /// test-only one.
    pub fn with_schema(folder: Option<PathBuf>, schema: Schema) -> Self {
        Self {
            folder,
            schema,
            store: Arc::default(),
        }
    }
    /// The schema the history is opened with, which a backup or a restored file
    /// is checked against.
    pub fn schema(&self) -> Schema {
        self.schema
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
        let (folder, schema, store) = (self.folder.clone(), self.schema, Arc::clone(&self.store));
        spawn_blocking(move || with_store(folder.as_deref(), schema, &store, Box::new(f)))
            .await
            .unwrap_or(Err(Error::Database))
    }
    /// Hand `f` the store and the path of its file while nothing else can use the
    /// store, so that `f` can close it and replace the file; `f` fails if it
    /// didn't. The next `run` opens the file again. A history from an older
    /// release that can't be upgraded is handed over unopened, with no store, and
    /// is still remembered as such if `f` fails. `f` must drop the store before it
    /// touches the file, as Windows cannot replace a file that is open. A panic in
    /// `f` is reported as a database error.
    pub async fn replace<T: Send + 'static, E: Send + 'static>(
        &self,
        f: impl FnOnce(Option<Store>, &Path) -> Result<T, E> + Send + 'static,
    ) -> Result<Result<T, E>, Error> {
        let (folder, schema, store) = (self.folder.clone(), self.schema, Arc::clone(&self.store));
        spawn_blocking(move || with_file(folder.as_deref(), schema, &store, Box::new(f)))
            .await
            .unwrap_or(Err(Error::Database))
    }
}

#[cfg(test)]
impl Database {
    /// A database in `folder` whose upgrade has failed, keeping `copy`.
    pub(crate) fn not_upgraded(folder: PathBuf, copy: Option<String>) -> Self {
        Self {
            folder: Some(folder),
            schema: Schema::CURRENT,
            store: Arc::new(Mutex::new(State::NotUpgraded(copy))),
        }
    }
}

/// The database file in `folder`.
fn history_file(folder: &Path) -> PathBuf {
    folder.join(FILE_NAME)
}

/// Copy `from` to `to`, a name claimed new so that no file is ever replaced, and
/// flush it to disk through the handle it was written with, as Windows refuses to
/// flush one opened for reading. A failure removes what was written.
pub(super) fn copy_new(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut written = fs::File::create_new(to)?;
    let copied = fs::File::open(from)
        .and_then(|mut source| std::io::copy(&mut source, &mut written))
        .and_then(|_| written.sync_all());
    if copied.is_err() {
        let _ = fs::remove_file(to);
    }
    copied
}

/// Copy the history in `file`, at schema `version`, beside it before it is
/// upgraded, named from the local time; returns the copy's name.
fn keep_before_upgrade(file: &Path, version: i32) -> std::io::Result<String> {
    let name = format!(
        "history-v{version}-{}.sqlite",
        local_time::stamp(local_time::now())
    );
    copy_new(file, &file.with_file_name(&name))?;
    Ok(name)
}

/// The open store, or else the store opened from the database file in `folder`,
/// which an older release's history is upgraded to `schema` in, after a copy of
/// it is kept beside it. A failed upgrade is remembered in `state`.
fn take_or_open(folder: Option<&Path>, schema: Schema, state: &mut State) -> Result<Store, Error> {
    match std::mem::take(state) {
        State::Open(open) => Ok(open),
        State::NotUpgraded(copy) => {
            *state = State::NotUpgraded(copy.clone());
            Err(Error::NotUpgraded(copy))
        }
        State::Closed => {
            let folder = folder.ok_or(Error::Database)?;
            fs::create_dir_all(folder).map_err(|_| Error::Database)?;
            let file = history_file(folder);
            // Set once an upgrade is due: the copy's name, or none if it couldn't
            // be kept.
            let mut kept = None;
            let mut keep = |version| match keep_before_upgrade(&file, version) {
                Ok(copy) => {
                    kept = Some(Some(copy));
                    Ok(())
                }
                Err(_) => {
                    kept = Some(None);
                    Err(Error::Database)
                }
            };
            let opened = Store::open_with(&file, schema, Some(&mut keep));
            match (opened, kept) {
                (Err(_), Some(copy)) => {
                    *state = State::NotUpgraded(copy.clone());
                    Err(Error::NotUpgraded(copy))
                }
                (opened, _) => opened,
            }
        }
    }
}

/// Open the store if needed, then run `f` with it. A panic in `f` drops the store,
/// so the next call reopens it. `f` is boxed so that instantiations differ only by
/// result type, not by closure.
fn with_store<T>(
    folder: Option<&Path>,
    schema: Schema,
    store: &Mutex<State>,
    f: Box<dyn FnOnce(&mut Store) -> T + '_>,
) -> Result<T, Error> {
    let mut guard = store.lock().unwrap_or_else(PoisonError::into_inner);
    let mut open = take_or_open(folder, schema, &mut guard)?;
    let result = f(&mut open);
    *guard = State::Open(open);
    Ok(result)
}

/// Work given the store, if the history could be opened, and the path of its
/// file, which replaces the file or fails.
type Replacement<'a, T, E> = Box<dyn FnOnce(Option<Store>, &Path) -> Result<T, E> + 'a>;

/// Open the store if needed, then hand it and its file to `f`, holding the lock so
/// nothing else uses the store meanwhile. A history that can't be upgraded is
/// handed over without a store, so it can still be replaced, and stays
/// remembered if `f` fails. Otherwise the store is not kept, and the next use
/// opens the file afresh.
fn with_file<T, E>(
    folder: Option<&Path>,
    schema: Schema,
    store: &Mutex<State>,
    f: Replacement<'_, T, E>,
) -> Result<Result<T, E>, Error> {
    let file = history_file(folder.ok_or(Error::Database)?);
    let mut guard = store.lock().unwrap_or_else(PoisonError::into_inner);
    let (open, not_upgraded) = match take_or_open(folder, schema, &mut guard) {
        Ok(open) => (Some(open), None),
        Err(Error::NotUpgraded(copy)) => (None, Some(copy)),
        Err(error) => return Err(error),
    };
    let replaced = f(open, &file);
    // A history that couldn't be upgraded and wasn't replaced is still that one.
    *guard = match (&replaced, not_upgraded) {
        (Err(_), Some(copy)) => State::NotUpgraded(copy),
        _ => State::Closed,
    };
    Ok(replaced)
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
    use crate::storage::tests::{
        BANNER, UPGRADED, failing_at, setup, step, stopping_before, text, upgrading,
    };
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
        assert_eq!(
            with_store(Some(&folder()), Schema::CURRENT, &store, Box::new(|_| 1)),
            Ok(1)
        );
        sql::finish();
        // Already open: no further SQL or filesystem access.
        filesystem::install(Fixture::default());
        assert_eq!(
            with_store(Some(&folder()), Schema::CURRENT, &store, Box::new(|_| 2)),
            Ok(2)
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(Database::new(Some(folder())).path(), Some(path));
    }

    #[test]
    fn a_missing_or_unusable_folder_or_database_is_a_database_error() {
        let store = Mutex::default();
        assert_eq!(
            with_store(None, Schema::CURRENT, &store, Box::new(|_| 0)),
            Err(Error::Database)
        );
        assert_eq!(Database::new(None).path(), None);
        // A file occupies the folder's path.
        filesystem::install(Fixture {
            files: [(folder(), vec![])].into(),
            ..Default::default()
        });
        assert_eq!(
            with_store(Some(&folder()), Schema::CURRENT, &store, Box::new(|_| 0)),
            Err(Error::Database)
        );
        // The database cannot be opened.
        filesystem::install(Fixture::default());
        let mut failing = open(&folder().join(FILE_NAME));
        failing.reply = Err(rusqlite::Error::InvalidQuery);
        sql::expect(vec![failing]);
        assert_eq!(
            with_store(Some(&folder()), Schema::CURRENT, &store, Box::new(|_| 0)),
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
            run(database.replace(|_store, file| Ok::<_, ()>(file.to_owned()))),
            Ok(Ok(path.clone()))
        );
        // Nothing holds the store now, so the next use opens the file again.
        assert!(matches!(*database.store.lock().unwrap(), State::Closed));
        assert_eq!(run(database.run(|_| 1)), Ok(1));
        sql::finish();
        // An open store is handed over as it is.
        let two = |_: Option<Store>, _: &Path| Ok::<_, ()>(2);
        assert_eq!(run(database.replace(two)), Ok(Ok(2)));
        // Without a folder there is no file to hand over; a panic is a database error.
        assert_eq!(run(Database::new(None).replace(two)), Err(Error::Database));
        sql::expect(opening(&path));
        assert_eq!(
            run(database.replace::<(), ()>(|_, _| panic!("synthetic failure"))),
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
        assert!(matches!(
            *database
                .store
                .lock()
                .unwrap_or_else(PoisonError::into_inner),
            State::Closed
        ));
    }

    /// The one file named `history-v2-YYYYMMDD-HHMMSS.sqlite` in the data folder, with
    /// its contents.
    fn kept() -> Vec<(String, Vec<u8>)> {
        filesystem::inspect(|state| {
            state
                .files
                .iter()
                .filter(|(path, _)| path.parent() == Some(&folder()))
                .map(|(path, bytes)| {
                    (
                        path.file_name().unwrap().to_string_lossy().into_owned(),
                        bytes.clone(),
                    )
                })
                .filter(|(name, _)| name != FILE_NAME)
                .collect()
        })
    }
    fn is_copy_name(name: &str) -> bool {
        let stamp = name
            .strip_prefix("history-v2-")
            .and_then(|rest| rest.strip_suffix(".sqlite"));
        stamp.is_some_and(|stamp| {
            chrono::NaiveDateTime::parse_from_str(stamp, "%Y%m%d-%H%M%S").is_ok()
        })
    }
    /// The data folder holding an older release's history.
    fn older_history() -> Fixture {
        Fixture {
            files: [(folder().join(FILE_NAME), b"1.0.0 history".to_vec())].into(),
            ..Default::default()
        }
    }

    #[test]
    fn an_older_history_is_copied_beside_it_before_it_is_upgraded() {
        filesystem::install(older_history());
        let mut script = vec![open(&folder().join(FILE_NAME))];
        script.extend(upgrading());
        sql::expect(script);
        let store = Mutex::default();
        assert_eq!(
            with_store(Some(&folder()), UPGRADED, &store, Box::new(|_| 1)),
            Ok(1)
        );
        sql::finish();
        let kept = kept();
        assert_eq!(kept.len(), 1);
        assert!(is_copy_name(&kept[0].0), "{}", kept[0].0);
        assert_eq!(kept[0].1, b"1.0.0 history");
        // Flushed to disk before the upgrade went on.
        filesystem::inspect(|state| assert_eq!(state.synced, [folder().join(&kept[0].0)]));
    }

    #[test]
    fn a_failed_upgrade_names_its_copy_and_is_not_tried_again() {
        filesystem::install(older_history());
        let mut script = vec![open(&folder().join(FILE_NAME))];
        script.extend(failing_at(upgrading(), BANNER));
        sql::expect(script);
        let store = Mutex::default();
        let failed = with_store(Some(&folder()), UPGRADED, &store, Box::new(|_| 1));
        sql::finish();
        let kept = kept();
        assert_eq!(failed, Err(Error::NotUpgraded(Some(kept[0].0.clone()))));
        // The next use reports the same failure without opening, copying or reading.
        filesystem::install(Fixture::default());
        assert_eq!(
            with_store(Some(&folder()), UPGRADED, &store, Box::new(|_| 1)),
            failed
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn a_copy_that_cannot_be_kept_stops_the_upgrade_and_leaves_nothing() {
        let unwritable = Fixture {
            write_failure: true,
            ..older_history()
        };
        filesystem::install(unwritable);
        let mut script = vec![open(&folder().join(FILE_NAME))];
        script.extend(stopping_before(upgrading(), BANNER));
        sql::expect(script);
        let store = Mutex::default();
        assert_eq!(
            with_store(Some(&folder()), UPGRADED, &store, Box::new(|_| 1)),
            Err(Error::NotUpgraded(None))
        );
        sql::finish();
        assert!(kept().is_empty());
        filesystem::inspect(|state| {
            assert_eq!(state.files[&folder().join(FILE_NAME)], b"1.0.0 history")
        });
    }

    #[test]
    fn a_history_that_could_not_be_upgraded_is_handed_over_unopened_to_be_replaced() {
        filesystem::install(Fixture::default());
        let path = folder().join(FILE_NAME);
        let database = Database::not_upgraded(folder(), None);
        assert_eq!(
            run(database.replace(|store, file| Ok::<_, ()>((store.is_none(), file.to_owned())))),
            Ok(Ok((true, path.clone())))
        );
        // The next use opens the file afresh, as it may have been replaced.
        sql::expect(opening(&path));
        assert_eq!(run(database.run(|_| 1)), Ok(1));
        sql::finish();
        // So is one whose upgrade fails as it is handed over.
        filesystem::install(older_history());
        let mut script = vec![open(&path)];
        script.extend(failing_at(upgrading(), BANNER));
        sql::expect(script);
        let store = Mutex::default();
        let handed = with_file(
            Some(&folder()),
            UPGRADED,
            &store,
            Box::new(|store, _| Ok::<_, ()>(store.is_none())),
        );
        sql::finish();
        assert_eq!(handed, Ok(Ok(true)));
        assert!(matches!(*store.lock().unwrap(), State::Closed));
    }

    #[test]
    fn a_failed_replacement_of_a_history_that_could_not_be_upgraded_keeps_it_remembered() {
        filesystem::install(Fixture::default());
        let copy = Some("history-v2-20261021-143000.sqlite".to_owned());
        let database = Database::not_upgraded(folder(), copy.clone());
        assert_eq!(
            run(database.replace(|_, _| Err::<(), _>("not replaced"))),
            Ok(Err("not replaced"))
        );
        // The file is as it was, so it is neither opened nor copied again.
        assert_eq!(run(database.run(|_| 1)), Err(Error::NotUpgraded(copy)));
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }
}
