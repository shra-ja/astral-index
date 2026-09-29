//! Desktop IPC: narrow commands that return safe categories; request contexts stay native.
use crate::acquisition::{
    AcquisitionError, CacheError, CachedRequest, Cancellable, Category, FetchFailure,
    HttpTransport, Progress, RequestContext, RetryBudget, Retrying, Transport,
    extract_request_contexts, fetch_history, validate,
};
use crate::discovery::{
    ExtractionError,
    system::{DiscoveryError, extract_current_user_contexts},
};
use crate::storage::{self, Preview, Review, Summary};
use serde::Serialize;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{
    AppHandle, Builder, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder,
    ipc::{Channel, InvokeBody, Request},
};
use tokio_util::sync::CancellationToken;

pub mod database;
pub use database::Database;

/// Shared with `build.rs`, whose app manifest makes each command require a capability grant.
pub const COMMANDS: &[&str] = include!("desktop/commands.in");

/// Safe failure categories for the webview, sent as `{"kind": ..., "code"?: ...}`.
/// Paths, URLs, source text, credentials and response text never cross IPC.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "code", rename_all = "snake_case")]
pub enum Failure {
    UnsupportedHost,
    DiscoveryFailed,
    NoGameData,
    NoCache,
    NoRequest,
    FileTooLarge,
    InvalidFile,
    /// Every key was rejected and at least one had expired.
    ExpiredKey,
    /// Every key was rejected; the first nonzero API code.
    ApiError(i64),
    RateLimited,
    /// HoYoverse could not be reached, or a timeout or server error occurred.
    Network,
    Rejected,
    InvalidResponse,
    /// Nothing was sent, for example because no HTTPS client could be created.
    Internal,
    /// The user stopped the acquisition; nothing further was sent or kept.
    Cancelled,
    /// Retrieval needs a validated context; extract first.
    NoContext,
    /// The retrieved history exceeded the 16 MiB batch bound.
    HistoryTooLarge,
    /// Responses named more than one account or server.
    MixedAccounts,
    /// Records were retrieved, but no response named their server.
    MissingServer,
    /// The local database could not be opened, read or written.
    Storage,
    /// The stored account's context, such as its timezone, differs.
    ContextMismatch,
    /// A retrieved record differs from the stored one with the same ID.
    Conflict,
    /// Stored history changed after the preview; retrieve again.
    StalePreview,
    /// There is no retrieved history awaiting commit.
    NoPreview,
}

/// A failure, with the category and page being requested when retrieval failed.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct RetrievalFailure {
    #[serde(flatten)]
    failure: Failure,
    #[serde(skip_serializing_if = "Option::is_none")]
    gacha_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
}
impl From<Failure> for RetrievalFailure {
    /// A failure outside retrieval's requests, so without a location.
    fn from(failure: Failure) -> Self {
        Self {
            failure,
            gacha_type: None,
            page: None,
        }
    }
}

/// Retrieval progress for the webview: categories and counts only.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProgressEvent {
    Requesting {
        gacha_type: &'static str,
        page: u32,
        pages: usize,
        records: usize,
    },
    RetryPending {
        delay_ms: u64,
    },
}
impl From<Progress> for ProgressEvent {
    fn from(progress: Progress) -> Self {
        match progress {
            Progress::Requesting {
                category,
                page,
                pages,
                records,
            } => Self::Requesting {
                gacha_type: category.code(),
                page: page.get(),
                pages,
                records,
            },
            Progress::RetryPending { delay } => Self::RetryPending {
                delay_ms: delay.as_millis() as u64,
            },
        }
    }
}

/// What retrieval found: a review of the held preview, or no history at all.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Retrieved {
    Review(Review),
    NoHistory,
}

/// The current acquisition, held only in memory. Each extraction replaces it, and
/// a failed or cancelled one leaves no context.
#[derive(Default)]
pub struct Session {
    state: Mutex<Operation>,
}
#[derive(Default)]
struct Operation {
    /// Cancels the operation now running; each operation gets a new one.
    token: CancellationToken,
    /// The validated context and the retry budget its acquisition started, which
    /// retrieval continues with.
    acquisition: Option<(RequestContext, RetryBudget)>,
    /// The preview awaiting commit or discard. It holds no auth key.
    preview: Option<Preview>,
}
impl Session {
    fn state(&self) -> MutexGuard<'_, Operation> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
    /// Start an operation: stop any earlier one, so its late result cannot
    /// replace this one's, and drop the held context.
    fn begin(&self) -> CancellationToken {
        let mut state = self.state();
        state.token.cancel();
        state.token = CancellationToken::new();
        state.acquisition = None;
        state.preview = None;
        state.token.clone()
    }
    /// Start retrieval: stop any earlier operation and take the validated context,
    /// so the session holds no auth key from here on.
    fn take_validated(&self) -> Result<(CancellationToken, RequestContext, RetryBudget), Failure> {
        let mut state = self.state();
        state.token.cancel();
        state.token = CancellationToken::new();
        state.preview = None;
        let (context, budget) = state.acquisition.take().ok_or(Failure::NoContext)?;
        Ok((state.token.clone(), context, budget))
    }
    /// Hold a preview for commit or discard, unless its retrieval was cancelled.
    fn keep_preview(&self, token: &CancellationToken, preview: Preview) -> Result<(), Failure> {
        let mut state = self.state();
        if token.is_cancelled() {
            return Err(Failure::Cancelled);
        }
        state.preview = Some(preview);
        Ok(())
    }
    /// Keep a validated context, unless its operation was cancelled meanwhile.
    fn finish(
        &self,
        token: &CancellationToken,
        context: RequestContext,
        budget: RetryBudget,
    ) -> Result<(), Failure> {
        // Check under the lock that `cancel` takes, so no cancel can slip between.
        let mut state = self.state();
        if token.is_cancelled() {
            return Err(Failure::Cancelled);
        }
        state.acquisition = Some((context, budget));
        Ok(())
    }
    /// Take the held preview for commit; the session no longer holds it.
    fn take_preview(&self) -> Result<Preview, Failure> {
        self.state().preview.take().ok_or(Failure::NoPreview)
    }
    /// Drop the held preview, if any.
    fn discard(&self) {
        self.state().preview = None;
    }
    /// Stop the running operation and drop the held context.
    fn cancel(&self) {
        let mut state = self.state();
        state.token.cancel();
        state.acquisition = None;
        state.preview = None;
    }
}

// Separate from state management so tests can check commands fail safely without it.
fn handle_commands<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        extract_automatically,
        extract_from_file,
        cancel_acquisition,
        retrieve_history,
        commit_import,
        discard_import
    ])
}

/// Register the desktop commands, their in-memory session and the local database,
/// which stays unopened until first used.
pub fn register<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    handle_commands(builder.manage(Session::default())).setup(|app| {
        // Portable mode, or else local, not roaming, app data: history never
        // leaves the machine with a roaming Windows profile.
        let executable = std::env::current_exe().ok();
        let local = app.path().local_data_dir().ok();
        let folder = database::location(
            executable.as_deref(),
            local.map(|local| local.join(database::FOLDER_NAME)),
        );
        let opened = open_window(app.handle(), folder.as_deref());
        app.manage(Database::new(folder));
        opened.map_err(Into::into)
    })
}

/// Open the main window, keeping the webview's profile in the app's folder, so
/// portable mode leaves nothing of the app's behind on the machine.
fn open_window<R: Runtime>(app: &AppHandle<R>, folder: Option<&Path>) -> tauri::Result<()> {
    let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Roll Tracker")
        .inner_size(1000.0, 760.0)
        .min_inner_size(360.0, 580.0);
    if let Some(folder) = folder {
        window = window.data_directory(database::webview_folder(folder));
    }
    window.build().map(drop)
}

impl From<ExtractionError> for Failure {
    fn from(error: ExtractionError) -> Self {
        match error {
            ExtractionError::Discovery(DiscoveryError::UnsupportedHost) => Self::UnsupportedHost,
            ExtractionError::Discovery(_) => Self::DiscoveryFailed,
            ExtractionError::NoGameData => Self::NoGameData,
            ExtractionError::NoCache => Self::NoCache,
            ExtractionError::NoRequest => Self::NoRequest,
        }
    }
}

impl From<FetchFailure> for Failure {
    fn from(failure: FetchFailure) -> Self {
        match failure {
            FetchFailure::ExpiredKey => Self::ExpiredKey,
            FetchFailure::Api(code) => Self::ApiError(code),
            FetchFailure::RateLimited => Self::RateLimited,
            FetchFailure::Transient => Self::Network,
            FetchFailure::Rejected(_) => Self::Rejected,
            FetchFailure::InvalidResponse => Self::InvalidResponse,
            FetchFailure::Internal => Self::Internal,
            FetchFailure::Cancelled => Self::Cancelled,
        }
    }
}

impl From<AcquisitionError> for Failure {
    fn from(error: AcquisitionError) -> Self {
        match error {
            AcquisitionError::Fetch(failure) => failure.into(),
            AcquisitionError::CursorCycle => Self::InvalidResponse,
            AcquisitionError::TooLarge => Self::HistoryTooLarge,
            AcquisitionError::MixedAccounts | AcquisitionError::MixedServers => Self::MixedAccounts,
            AcquisitionError::MissingServer => Self::MissingServer,
        }
    }
}

impl From<storage::Error> for Failure {
    fn from(error: storage::Error) -> Self {
        match error {
            storage::Error::Database
            | storage::Error::Schema
            | storage::Error::InvalidStoredData => Self::Storage,
            storage::Error::Context => Self::ContextMismatch,
            storage::Error::TooLarge => Self::HistoryTooLarge,
            storage::Error::Parse(_) => Self::InvalidResponse,
            storage::Error::Conflict => Self::Conflict,
            storage::Error::StalePreview => Self::StalePreview,
            // Retrieval previews only when records exist, so this is a defect.
            storage::Error::Empty => Self::Internal,
        }
    }
}

/// Validate the extracted requests and keep only the first working context
/// ([decision 0007](../../docs/decisions/0007-validate-during-extraction.md)).
/// The session is emptied first, so a failure at any step leaves no context, and
/// every cached URL is dropped when this returns.
async fn acquire(
    session: &Session,
    extracted: Result<Vec<CachedRequest>, Failure>,
) -> Result<(), Failure> {
    let token = session.begin();
    let requests = extracted?;
    let transport = HttpTransport::new().map_err(|_| Failure::Internal)?;
    validate_into(session, &transport, &token, requests).await
}

/// Validate over `transport`, retrying transient failures within a new
/// acquisition's budget, until done or cancelled.
async fn validate_into(
    session: &Session,
    transport: &(impl Transport + Sync),
    token: &CancellationToken,
    requests: Vec<CachedRequest>,
) -> Result<(), Failure> {
    let budget = RetryBudget::default();
    // Progress reaches the webview with the acquisition controls.
    let retrying = Retrying::new(transport, &budget, &|_| {});
    let context = validate(&Cancellable::new(&retrying, token), requests).await?;
    session.finish(token, context, budget)
}

// Bounded cache and log reads run synchronously on the async worker running this command.
async fn extract_into(session: &Session) -> Result<(), Failure> {
    acquire(
        session,
        extract_current_user_contexts().await.map_err(Failure::from),
    )
    .await
}

async fn extract_file_into(session: &Session, body: &InvokeBody) -> Result<(), Failure> {
    let extracted = match body {
        InvokeBody::Raw(bytes) => extract_request_contexts(bytes).map_err(|error| {
            if error == CacheError::TooLarge {
                Failure::FileTooLarge
            } else {
                Failure::NoRequest
            }
        }),
        InvokeBody::Json(_) => Err(Failure::InvalidFile),
    };
    acquire(session, extracted).await
}

/// Contacts HoYoverse to validate the extracted auth keys.
#[tauri::command]
async fn extract_automatically(session: State<'_, Session>) -> Result<(), Failure> {
    extract_into(&session).await
}

/// Stop the running extraction or acquisition and drop the held context.
#[tauri::command]
fn cancel_acquisition(session: State<'_, Session>) {
    session.cancel();
}

/// Retrieve every category from the validated context, continuing its retry
/// budget, and preview it. The auth key is dropped as soon as retrieval ends,
/// whatever the outcome; the session then holds only the preview.
async fn retrieve_into(
    session: &Session,
    database: &Database,
    transport: Result<&(impl Transport + Sync), Failure>,
    progress: &(dyn Fn(ProgressEvent) + Sync),
) -> Result<Retrieved, RetrievalFailure> {
    let (token, context, budget) = session.take_validated()?;
    let transport = transport?;
    // The last page requested locates a retrieval failure.
    let requesting = Mutex::new(None);
    let report = |event: Progress| {
        if let Progress::Requesting { category, page, .. } = event {
            *requesting.lock().unwrap_or_else(PoisonError::into_inner) = Some((category, page));
        }
        progress(event.into());
    };
    let retrying = Retrying::new(transport, &budget, &report);
    let fetched = fetch_history(&Cancellable::new(&retrying, &token), &context, &report).await;
    drop(context);
    let history = fetched.map_err(|error| {
        let location = requesting
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        RetrievalFailure {
            failure: error.into(),
            gacha_type: location.map(|(category, _)| Category::code(category)),
            page: location.map(|(_, page)| page.get()),
        }
    })?;
    let Some(account) = history.account() else {
        return Ok(Retrieved::NoHistory);
    };
    let (uid, server) = (account.uid().to_owned(), account.server().to_owned());
    let preview = database
        .run(move |store| store.preview(&uid, &server, &history.responses()))
        .await
        .and_then(|preview| preview)
        .map_err(Failure::from)?;
    let review = preview.review().clone();
    session.keep_preview(&token, preview)?;
    Ok(Retrieved::Review(review))
}

/// Send progress to the webview; a closed webview is not an error.
fn forward(channel: &Channel<ProgressEvent>) -> impl Fn(ProgressEvent) + Sync + '_ {
    move |event| {
        let _ = channel.send(event);
    }
}

/// Commit the held preview, imported at `imported_at` (Unix seconds). The preview
/// is used up whatever the outcome; after a failure, retrieve again. A commit is
/// atomic and quick, so it is not cancellable.
async fn commit_into(
    session: &Session,
    database: &Database,
    imported_at: i64,
) -> Result<Summary, Failure> {
    let preview = session.take_preview()?;
    database
        .run(move |store| store.commit(preview, imported_at))
        .await
        .and_then(|summary| summary)
        .map_err(Failure::from)
}

/// Write the held preview to local history and return what it added.
#[tauri::command]
async fn commit_import(
    session: State<'_, Session>,
    database: State<'_, Database>,
) -> Result<Summary, Failure> {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH);
    commit_into(
        &session,
        &database,
        now.map_or(0, |elapsed| elapsed.as_secs() as i64),
    )
    .await
}

/// Drop the held preview without writing anything.
#[tauri::command]
fn discard_import(session: State<'_, Session>) {
    session.discard();
}

/// Contacts HoYoverse to retrieve history, streaming progress to `on_progress`.
#[tauri::command]
async fn retrieve_history(
    session: State<'_, Session>,
    database: State<'_, Database>,
    on_progress: Channel<ProgressEvent>,
) -> Result<Retrieved, RetrievalFailure> {
    let transport = HttpTransport::new();
    let transport = transport.as_ref().map_err(|_| Failure::Internal);
    retrieve_into(&session, &database, transport, &forward(&on_progress)).await
}

/// The webview sends the selected file's bytes as a raw body; no path crosses IPC.
/// Contacts HoYoverse to validate the extracted auth keys.
#[tauri::command]
async fn extract_from_file(
    request: Request<'_>,
    session: State<'_, Session>,
) -> Result<(), Failure> {
    extract_file_into(&session, request.body()).await
}

#[cfg(test)]
mod tests {
    pub(crate) mod blocking;
    mod events;
    use super::*;
    use crate::acquisition::MAX_CACHE_BYTES;
    use crate::acquisition::TransportError;
    use crate::acquisition::tests::{filesystem, http, scripted::Scripted};
    use crate::discovery::system::tests::os;
    use crate::storage::tests::database::{self as sql, Reply};
    use crate::storage::tests::{
        commit_script, preview, preview_script, setup, stale_commit_script, step, text,
    };
    use std::path::PathBuf;
    use tauri::{
        Manager, WebviewWindow, WebviewWindowBuilder,
        ipc::CallbackFn,
        test::{
            INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
        },
        webview::InvokeRequest,
    };

    const ENDPOINT: &str = "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?";
    const PAGE: &[u8] = include_bytes!("../tests/fixtures/hsr-api/page.json");

    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(future)
    }
    fn url(key: &str) -> String {
        format!("{ENDPOINT}authkey={key}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en")
    }
    /// A cache holding `keys`; validation tries them in reverse order.
    fn cache(keys: &[&str]) -> Vec<u8> {
        keys.iter()
            .flat_map(|key| format!("1/0/{}\0", url(key)).into_bytes())
            .collect()
    }
    fn context(key: &str) -> RequestContext {
        extract_request_contexts(&cache(&[key]))
            .unwrap()
            .remove(0)
            .into_context()
    }
    /// Script HoYoverse's responses to validation requests, each an HTTP 200 body.
    fn respond(bodies: &[&[u8]]) {
        http::install(http::Fixture {
            responses: bodies
                .iter()
                .map(|body| {
                    Ok(http::Plan {
                        status: 200,
                        chunks: vec![Ok(body.to_vec())],
                    })
                })
                .collect(),
            ..Default::default()
        });
    }
    const EXPIRED: &[u8] = br#"{"retcode":-101,"message":"synthetic","data":null}"#;
    fn requested() -> Vec<String> {
        http::inspect(|state| state.requested.clone())
    }
    fn window() -> WebviewWindow<MockRuntime> {
        let mut app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        // Run the setup hook, which manages the database and opens the window
        // (see the registration test).
        #[allow(deprecated)]
        app.run_iteration(events::ignore);
        app.get_webview_window("main").unwrap()
    }
    // IPC commands run on Tauri's worker threads, which cannot see the thread-local
    // doubles; IPC tests therefore cover only failures before any request.
    fn invoke(
        window: &WebviewWindow<MockRuntime>,
        cmd: &str,
        body: InvokeBody,
    ) -> Result<(), String> {
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body,
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
    }
    fn held(session: &Session) -> Option<(RequestContext, RetryBudget)> {
        session.state().acquisition.take()
    }
    fn stored(session: &Session) -> Option<RequestContext> {
        held(session).map(|(context, _)| context)
    }
    fn raw(bytes: Vec<u8>) -> InvokeBody {
        InvokeBody::Raw(bytes)
    }

    #[test]
    fn registers_exactly_the_manifest_commands_and_rejects_others() {
        let window = window();
        assert_eq!(
            COMMANDS,
            [
                "extract_automatically",
                "extract_from_file",
                "cancel_acquisition",
                "retrieve_history",
                "commit_import",
                "discard_import"
            ]
        );
        // Nothing was retrieved, so there is nothing to commit; discarding is harmless.
        assert_eq!(
            invoke(&window, COMMANDS[4], InvokeBody::default()),
            Err(r#"{"kind":"no_preview"}"#.into())
        );
        assert_eq!(invoke(&window, COMMANDS[5], InvokeBody::default()), Ok(()));
        assert_eq!(invoke(&window, COMMANDS[2], InvokeBody::default()), Ok(()));
        // Nothing was validated, so retrieval sends nothing.
        let channel = serde_json::json!({ "onProgress": "__CHANNEL__:1" });
        assert_eq!(
            invoke(&window, COMMANDS[3], InvokeBody::Json(channel)),
            Err(r#"{"kind":"no_context"}"#.into())
        );
        // Host discovery is unsupported here: the unit-test OS double reports plain Linux.
        assert_eq!(
            invoke(&window, COMMANDS[0], InvokeBody::default()),
            Err(r#"{"kind":"unsupported_host"}"#.into())
        );
        assert_eq!(
            invoke(&window, COMMANDS[1], InvokeBody::default()),
            Err(r#"{"kind":"invalid_file"}"#.into())
        );
        assert_eq!(
            invoke(&window, COMMANDS[1], raw(b"no request".to_vec())),
            Err(r#"{"kind":"no_request"}"#.into())
        );
        // A progress channel is required.
        let missing = invoke(&window, COMMANDS[3], InvokeBody::default());
        assert!(missing.unwrap_err().contains("onProgress"));
        let unknown = invoke(&window, "read_arbitrary_file", InvokeBody::default());
        assert!(unknown.unwrap_err().contains("not found"));
        assert_eq!(stored(&window.state::<Session>()), None);
    }

    #[test]
    fn registration_opens_the_window_with_its_data_in_the_named_local_folder() {
        let mut app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        // Tauri runs setup hooks on the event loop's first event; with the mock
        // runtime, only this deprecated call runs them. It is called once here.
        #[allow(deprecated)]
        app.run_iteration(events::ignore);
        let folder = app.path().local_data_dir().unwrap().join("roll-tracker");
        assert_eq!(
            app.state::<Database>().path(),
            Some(folder.join(database::FILE_NAME))
        );
        assert!(app.get_webview_window("main").is_some());
    }

    #[test]
    fn the_window_opens_even_without_a_data_folder() {
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        open_window(app.handle(), None).unwrap();
        assert!(app.get_webview_window("main").is_some());
    }

    #[test]
    fn database_commands_fail_safely_without_a_managed_database() {
        // Built without running setup, so no database is managed.
        let app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let channel = serde_json::json!({ "onProgress": "__CHANNEL__:1" });
        let error = invoke(&window, "retrieve_history", InvokeBody::Json(channel));
        assert!(error.unwrap_err().contains("state not managed"));
        let error = invoke(&window, "commit_import", InvokeBody::default());
        assert!(error.unwrap_err().contains("state not managed"));
    }

    #[test]
    fn commands_fail_safely_without_a_managed_session() {
        let app = handle_commands(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        for command in COMMANDS {
            let error = invoke(&window, command, raw(cache(&["synthetic"])));
            assert!(error.unwrap_err().contains("state not managed"));
        }
    }

    #[test]
    fn failures_cross_ipc_as_kinds_with_only_an_api_code() {
        for (failure, json) in [
            (Failure::ExpiredKey, r#"{"kind":"expired_key"}"#),
            (
                Failure::ApiError(-100),
                r#"{"kind":"api_error","code":-100}"#,
            ),
            (Failure::Network, r#"{"kind":"network"}"#),
        ] {
            assert_eq!(serde_json::to_string(&failure).unwrap(), json);
        }
    }

    #[test]
    fn file_extraction_keeps_only_the_first_validated_context() {
        respond(&[EXPIRED, PAGE]);
        let session = Session::default();
        let body = raw(cache(&["untried", "valid", "expired"]));
        assert_eq!(run(extract_file_into(&session, &body)), Ok(()));
        assert_eq!(requested(), [url("expired"), url("valid")]);
        assert_eq!(stored(&session), Some(context("valid")));
    }

    #[test]
    fn validation_retries_transient_failures_within_the_budget() {
        let status = |status: u16, body: &[u8]| {
            Ok(http::Plan {
                status,
                chunks: vec![Ok(body.to_vec())],
            })
        };
        http::install(http::Fixture {
            responses: [
                status(503, b""),
                status(200, EXPIRED),
                status(503, b""),
                status(200, PAGE),
            ]
            .into(),
            ..Default::default()
        });
        let session = Session::default();
        let body = raw(cache(&["valid", "expired"]));
        assert_eq!(run(extract_file_into(&session, &body)), Ok(()));
        assert_eq!(
            requested(),
            [url("expired"), url("expired"), url("valid"), url("valid")]
        );
        // Retrieval continues with what validation left of the budget.
        let (context_held, budget) = held(&session).unwrap();
        assert_eq!(context_held, context("valid"));
        assert_eq!(budget.remaining(), 0);
    }

    const EMPTY: &[u8] = br#"{"retcode":0,"message":"OK","data":{"region":"synthetic-server","region_time_zone":8,"list":[]}}"#;
    /// Hold a validated context with the given budget, as extraction leaves it.
    fn validated(session: &Session, budget: RetryBudget) {
        let token = session.begin();
        session.finish(&token, context("valid"), budget).unwrap();
    }
    fn database() -> Database {
        filesystem::install(Default::default());
        Database::new(Some(PathBuf::from("/data")))
    }
    fn opening() -> Vec<sql::Step> {
        let mut steps = vec![step(
            "OPEN",
            vec![text("/data/history.sqlite")],
            Reply::Done,
        )];
        steps.extend(setup(true));
        steps
    }
    /// The fixture page answers the first category, and empty pages the rest.
    fn pages() -> Vec<Result<Vec<u8>, TransportError>> {
        let mut pages = vec![Ok(PAGE.to_vec())];
        pages.extend((0..5).map(|_| Ok(EMPTY.to_vec())));
        pages
    }
    /// Discard progress in tests that do not check it.
    fn ignore(_: ProgressEvent) {}
    fn json(value: impl Serialize) -> serde_json::Value {
        serde_json::to_value(value).unwrap()
    }
    /// Whether the session holds a validated context, and a preview.
    fn holds(session: &Session) -> (bool, bool) {
        let state = session.state();
        (state.acquisition.is_some(), state.preview.is_some())
    }

    #[test]
    fn retrieval_previews_every_category_and_holds_only_the_preview() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let database = database();
        let mut script = opening();
        script.extend(preview_script());
        sql::expect(script);
        // The first request fails transiently and is retried within the budget.
        let mut responses = vec![Err(TransportError::Status(503))];
        responses.extend(pages());
        let transport = Serving::new(responses);
        let events = std::sync::Mutex::new(Vec::new());
        let report = |event| events.lock().unwrap().push(event);
        let retrieved = run(retrieve_into(&session, &database, Ok(&transport), &report));
        sql::finish();
        let review = json(retrieved.unwrap());
        assert_eq!(review["kind"], "review");
        assert_eq!(review["uid"], "100000002");
        assert_eq!(review["summary"]["inserted"], 2);
        assert_eq!(transport.requested().len(), 7);
        let events = events.into_inner().unwrap();
        assert_eq!(events[1], ProgressEvent::RetryPending { delay_ms: 1000 });
        assert_eq!(
            [events[0].clone(), events[2].clone()],
            [
                ProgressEvent::Requesting {
                    gacha_type: "1",
                    page: 1,
                    pages: 0,
                    records: 0
                },
                ProgressEvent::Requesting {
                    gacha_type: "2",
                    page: 1,
                    pages: 1,
                    records: 2
                },
            ]
        );
        // The auth key is gone; only the preview remains, until cancelled.
        assert_eq!(holds(&session), (false, true));
        session.cancel();
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn no_records_means_no_history_and_no_database_access() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let database = database();
        let transport = Serving::new((0..6).map(|_| Ok(EMPTY.to_vec())).collect());
        let retrieved = run(retrieve_into(&session, &database, Ok(&transport), &ignore));
        assert_eq!(
            json(retrieved.unwrap()),
            serde_json::json!({ "kind": "no_history" })
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn a_failed_retrieval_reports_where_it_failed_and_drops_the_key() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let transport = Serving::new(vec![Ok(EMPTY.to_vec()), Ok(EXPIRED.to_vec())]);
        let failure = run(retrieve_into(
            &session,
            &database(),
            Ok(&transport),
            &ignore,
        ));
        assert_eq!(
            json(failure.err().unwrap()),
            serde_json::json!({ "kind": "expired_key", "gacha_type": "2", "page": 1 })
        );
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn retrieval_needs_a_validated_context_and_a_client() {
        let session = Session::default();
        let transport = Serving::new(vec![]);
        let failure = run(retrieve_into(
            &session,
            &database(),
            Ok(&transport),
            &ignore,
        ));
        assert_eq!(failure.err().unwrap(), Failure::NoContext.into());
        // A missing HTTPS client still ends retrieval, dropping the key.
        validated(&session, RetryBudget::default());
        let failure = run(retrieve_into(
            &session,
            &database(),
            Err::<&Serving, _>(Failure::Internal),
            &ignore,
        ));
        assert_eq!(failure.err().unwrap(), Failure::Internal.into());
        assert_eq!(holds(&session), (false, false));
        assert!(transport.requested().is_empty());
    }

    #[test]
    fn a_database_failure_after_retrieval_has_no_location() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let database = database();
        let mut failing = opening().remove(0);
        failing.reply = Err(rusqlite::Error::InvalidQuery);
        sql::expect(vec![failing]);
        let transport = Serving::new(pages());
        let failure = run(retrieve_into(&session, &database, Ok(&transport), &ignore));
        sql::finish();
        assert_eq!(failure.err().unwrap(), Failure::Storage.into());
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn cancelling_stops_retrieval_and_keeps_no_preview() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let transport = Serving::cancelling(&session, 1, pages());
        let failure = run(retrieve_into(
            &session,
            &database(),
            Ok(&transport),
            &ignore,
        ));
        assert_eq!(json(failure.err().unwrap())["kind"], "cancelled");
        assert_eq!(transport.requested().len(), 1);
        // A preview finished after cancelling is not kept.
        let token = session.begin();
        session.cancel();
        assert_eq!(
            session.keep_preview(&token, preview()),
            Err(Failure::Cancelled)
        );
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn retrieval_continues_the_budget_validation_left() {
        // Validation spent both retries.
        let budget = RetryBudget::default();
        let spend = Serving::new(vec![
            Err(TransportError::Timeout),
            Ok(vec![]),
            Err(TransportError::Timeout),
            Ok(vec![]),
        ]);
        run(async {
            let retrying = Retrying::new(&spend, &budget, &|_| {});
            retrying.get("a").await.unwrap();
            retrying.get("b").await.unwrap();
        });
        let session = Session::default();
        validated(&session, budget);
        let transport = Serving::new(vec![Err(TransportError::Status(503))]);
        let failure = run(retrieve_into(
            &session,
            &database(),
            Ok(&transport),
            &ignore,
        ));
        assert_eq!(
            json(failure.err().unwrap()),
            serde_json::json!({ "kind": "network", "gacha_type": "1", "page": 1 })
        );
        assert_eq!(transport.requested().len(), 1);
    }

    #[test]
    fn progress_reaches_the_webview_as_categories_and_counts() {
        let sent = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let received = std::sync::Arc::clone(&sent);
        let channel = Channel::new(move |body| {
            let event: serde_json::Value = body.deserialize().unwrap();
            received.lock().unwrap().push(event);
            Ok(())
        });
        forward(&channel)(ProgressEvent::from(Progress::RetryPending {
            delay: std::time::Duration::from_secs(1),
        }));
        assert_eq!(
            *sent.lock().unwrap(),
            [serde_json::json!({ "kind": "retry_pending", "delay_ms": 1000 })]
        );
        let requesting = ProgressEvent::from(Progress::Requesting {
            category: Category::LightConeEvent,
            page: std::num::NonZeroU32::new(3).unwrap(),
            pages: 4,
            records: 3000,
        });
        assert_eq!(
            json(requesting),
            serde_json::json!({ "kind": "requesting", "gacha_type": "12", "page": 3, "pages": 4, "records": 3000 })
        );
    }

    #[test]
    fn retrieval_and_storage_errors_map_to_safe_categories() {
        for (error, failure) in [
            (
                AcquisitionError::Fetch(FetchFailure::ExpiredKey),
                Failure::ExpiredKey,
            ),
            (AcquisitionError::CursorCycle, Failure::InvalidResponse),
            (AcquisitionError::TooLarge, Failure::HistoryTooLarge),
            (AcquisitionError::MixedAccounts, Failure::MixedAccounts),
            (AcquisitionError::MixedServers, Failure::MixedAccounts),
            (AcquisitionError::MissingServer, Failure::MissingServer),
        ] {
            assert_eq!(Failure::from(error), failure);
        }
        for (error, failure) in [
            (storage::Error::Database, Failure::Storage),
            (storage::Error::Schema, Failure::Storage),
            (storage::Error::InvalidStoredData, Failure::Storage),
            (storage::Error::Context, Failure::ContextMismatch),
            (storage::Error::TooLarge, Failure::HistoryTooLarge),
            (
                storage::Error::Parse(crate::ParseError::InvalidRecord),
                Failure::InvalidResponse,
            ),
            (storage::Error::Conflict, Failure::Conflict),
            (storage::Error::StalePreview, Failure::StalePreview),
            (storage::Error::Empty, Failure::Internal),
        ] {
            assert_eq!(Failure::from(error), failure);
        }
    }

    /// Hold a preview of one new record, as retrieval leaves it.
    fn previewed(session: &Session) {
        let token = session.begin();
        session.keep_preview(&token, preview()).unwrap();
    }

    #[test]
    fn commit_writes_the_held_preview_and_uses_it_up() {
        let session = Session::default();
        previewed(&session);
        let database = database();
        let mut script = opening();
        script.extend(commit_script(false));
        sql::expect(script);
        let summary = run(commit_into(&session, &database, 1234)).unwrap();
        sql::finish();
        assert_eq!(
            json(summary),
            serde_json::json!({ "inserted": 1, "duplicates": 0, "conflicts": 0 })
        );
        assert_eq!(holds(&session), (false, false));
        // Nothing is left to commit.
        assert_eq!(
            run(commit_into(&session, &database, 1234)),
            Err(Failure::NoPreview)
        );
    }

    #[test]
    fn a_refused_commit_writes_nothing_and_uses_up_the_preview() {
        let session = Session::default();
        previewed(&session);
        let database = database();
        let mut script = opening();
        script.extend(stale_commit_script());
        sql::expect(script);
        assert_eq!(
            run(commit_into(&session, &database, 1234)),
            Err(Failure::StalePreview)
        );
        sql::finish();
        assert_eq!(holds(&session), (false, false));
        // A database that cannot be opened is a storage failure.
        previewed(&session);
        let mut failing = opening().remove(0);
        failing.reply = Err(rusqlite::Error::InvalidQuery);
        sql::expect(vec![failing]);
        assert_eq!(
            run(commit_into(
                &session,
                &Database::new(Some(PathBuf::from("/data"))),
                1234
            )),
            Err(Failure::Storage)
        );
        sql::finish();
    }

    #[test]
    fn discarding_drops_the_preview_without_writing() {
        let session = Session::default();
        previewed(&session);
        sql::expect(vec![]);
        session.discard();
        sql::finish();
        assert_eq!(holds(&session), (false, false));
        session.discard();
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn cancel_stops_the_running_operation_and_drops_the_context() {
        let session = Session::default();
        let token = session.begin();
        session
            .finish(&token, context("valid"), RetryBudget::default())
            .unwrap();
        session.cancel();
        assert!(token.is_cancelled());
        assert_eq!(stored(&session), None);
    }

    #[test]
    fn a_cancelled_or_superseded_operation_keeps_no_late_result() {
        let session = Session::default();
        let token = session.begin();
        session.cancel();
        assert_eq!(
            session.finish(&token, context("late"), RetryBudget::default()),
            Err(Failure::Cancelled)
        );
        assert_eq!(stored(&session), None);
        // Starting another operation stops the earlier one.
        let earlier = session.begin();
        let later = session.begin();
        assert!(earlier.is_cancelled());
        assert!(!later.is_cancelled());
        assert_eq!(
            session.finish(&earlier, context("earlier"), RetryBudget::default()),
            Err(Failure::Cancelled)
        );
        assert_eq!(stored(&session), None);
    }

    /// Serves scripted responses; with a count, cancels the session as it serves
    /// that many. One transport type keeps each tested function to one
    /// instantiation, which coverage scores as a whole.
    struct Serving<'a> {
        scripted: Scripted,
        cancel: Option<(&'a Session, std::sync::Mutex<usize>)>,
    }
    impl<'a> Serving<'a> {
        fn new(responses: Vec<Result<Vec<u8>, TransportError>>) -> Self {
            Self {
                scripted: Scripted::new(responses),
                cancel: None,
            }
        }
        fn cancelling(
            session: &'a Session,
            after: usize,
            responses: Vec<Result<Vec<u8>, TransportError>>,
        ) -> Self {
            Self {
                scripted: Scripted::new(responses),
                cancel: Some((session, after.into())),
            }
        }
        fn requested(&self) -> Vec<String> {
            self.scripted.requested()
        }
    }
    impl Transport for Serving<'_> {
        async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
            let response = self.scripted.get(url).await;
            if let Some((session, left)) = &self.cancel {
                let mut left = left.lock().unwrap();
                *left -= 1;
                if *left == 0 {
                    session.cancel();
                }
            }
            response
        }
    }

    #[test]
    fn a_preview_finished_after_cancelling_is_not_kept() {
        let session = Session::default();
        validated(&session, RetryBudget::default());
        let database = database();
        let mut script = opening();
        script.extend(preview_script());
        sql::expect(script);
        // The last response still arrives, so the preview is built, then refused.
        let transport = Serving::cancelling(&session, 6, pages());
        let failure = run(retrieve_into(&session, &database, Ok(&transport), &ignore));
        sql::finish();
        assert_eq!(failure.err().unwrap(), Failure::Cancelled.into());
        assert_eq!(holds(&session), (false, false));
    }

    #[test]
    fn cancelling_during_validation_sends_no_further_request() {
        let session = Session::default();
        let transport = Serving::cancelling(&session, 1, vec![Ok(EXPIRED.to_vec())]);
        let requests = extract_request_contexts(&cache(&["valid", "expired"])).unwrap();
        let token = session.begin();
        assert_eq!(
            run(validate_into(&session, &transport, &token, requests)),
            Err(Failure::Cancelled)
        );
        assert_eq!(transport.requested(), [url("expired")]);
        assert_eq!(stored(&session), None);
    }

    #[test]
    fn failed_extraction_or_validation_leaves_no_context() {
        let session = Session::default();
        let earlier = || {
            let token = session.begin();
            session
                .finish(&token, context("earlier"), RetryBudget::default())
                .unwrap();
        };
        for (body, failure) in [
            (raw(b"no request".to_vec()), Failure::NoRequest),
            (raw(vec![0; MAX_CACHE_BYTES + 1]), Failure::FileTooLarge),
            (InvokeBody::default(), Failure::InvalidFile),
        ] {
            http::install(Default::default());
            earlier();
            assert_eq!(run(extract_file_into(&session, &body)), Err(failure));
            assert_eq!(stored(&session), None);
            assert!(requested().is_empty());
        }
        respond(&[EXPIRED]);
        earlier();
        assert_eq!(
            run(extract_file_into(&session, &raw(cache(&["synthetic"])))),
            Err(Failure::ExpiredKey)
        );
        assert_eq!(stored(&session), None);
        http::install(http::Fixture {
            build_error: true,
            ..Default::default()
        });
        earlier();
        assert_eq!(
            run(extract_file_into(&session, &raw(cache(&["synthetic"])))),
            Err(Failure::Internal)
        );
        assert_eq!(stored(&session), None);
        assert!(requested().is_empty());
    }

    #[test]
    fn automatic_extraction_validates_discovered_contexts() {
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:\\Users\\Example\\AppData\\Roaming"),
                os::Plan::output("/windows/c/Users/Example/AppData/Roaming\n"),
                os::Plan::output("/volumes/games/Star Rail\n"),
            ]
            .into(),
            ..Default::default()
        });
        filesystem::install(filesystem::Fixture {
            files: [
                (
                    PathBuf::from(
                        "/windows/c/Users/Example/AppData/LocalLow/Cognosphere/Star Rail/Player.log",
                    ),
                    b"Loading player data from D:/Games/Star Rail/data.unity3d\n".to_vec(),
                ),
                (
                    PathBuf::from("/volumes/games/Star Rail/webCaches/3.0.0.0/Cache/Cache_Data/data_2"),
                    cache(&["discovered"]),
                ),
            ]
            .into(),
            listings: [(
                PathBuf::from("/volumes/games/Star Rail/webCaches"),
                vec![PathBuf::from("/volumes/games/Star Rail/webCaches/3.0.0.0")],
            )]
            .into(),
            ..Default::default()
        });
        respond(&[PAGE]);
        let session = Session::default();
        assert_eq!(run(extract_into(&session)), Ok(()));
        assert_eq!(requested(), [url("discovered")]);
        assert_eq!(stored(&session), Some(context("discovered")));
    }

    #[test]
    fn errors_map_to_safe_categories() {
        for (error, failure) in [
            (
                ExtractionError::Discovery(DiscoveryError::UnsupportedHost),
                Failure::UnsupportedHost,
            ),
            (
                ExtractionError::Discovery(DiscoveryError::TimedOut),
                Failure::DiscoveryFailed,
            ),
            (ExtractionError::NoGameData, Failure::NoGameData),
            (ExtractionError::NoCache, Failure::NoCache),
            (ExtractionError::NoRequest, Failure::NoRequest),
        ] {
            assert_eq!(Failure::from(error), failure);
        }
        for (fetch, failure) in [
            (FetchFailure::ExpiredKey, Failure::ExpiredKey),
            (FetchFailure::Api(-100), Failure::ApiError(-100)),
            (FetchFailure::RateLimited, Failure::RateLimited),
            (FetchFailure::Transient, Failure::Network),
            (FetchFailure::Rejected(302), Failure::Rejected),
            (FetchFailure::InvalidResponse, Failure::InvalidResponse),
            (FetchFailure::Internal, Failure::Internal),
            (FetchFailure::Cancelled, Failure::Cancelled),
        ] {
            assert_eq!(Failure::from(fetch), failure);
        }
    }
}
