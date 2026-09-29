//! Desktop IPC: narrow commands that return safe categories; request contexts stay native.
use crate::acquisition::{
    CacheError, CachedRequest, Cancellable, FetchFailure, HttpTransport, RequestContext,
    RetryBudget, Retrying, Transport, extract_request_contexts, validate,
};
use crate::discovery::{
    ExtractionError,
    system::{DiscoveryError, extract_current_user_contexts},
};
use serde::Serialize;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{
    Builder, Manager, Runtime, State,
    ipc::{InvokeBody, Request},
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
        state.token.clone()
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
    /// Stop the running operation and drop the held context.
    fn cancel(&self) {
        let mut state = self.state();
        state.token.cancel();
        state.acquisition = None;
    }
}

// Separate from state management so tests can check commands fail safely without it.
fn handle_commands<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        extract_automatically,
        extract_from_file,
        cancel_acquisition
    ])
}

/// Register the desktop commands, their in-memory session and the local database,
/// which stays unopened until first used.
pub fn register<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    handle_commands(builder.manage(Session::default())).setup(|app| {
        // Portable mode, or else local, not roaming, app data: history never
        // leaves the machine with a roaming Windows profile.
        let executable = std::env::current_exe().ok();
        let local = app.path().app_local_data_dir().ok();
        app.manage(Database::new(database::location(
            executable.as_deref(),
            local,
        )));
        Ok(())
    })
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
    mod events;
    use super::*;
    use crate::acquisition::MAX_CACHE_BYTES;
    use crate::acquisition::TransportError;
    use crate::acquisition::tests::{filesystem, http, scripted::Scripted};
    use crate::discovery::system::tests::os;
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
        let app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap()
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
                "cancel_acquisition"
            ]
        );
        assert_eq!(invoke(&window, COMMANDS[2], InvokeBody::default()), Ok(()));
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
        let unknown = invoke(&window, "read_arbitrary_file", InvokeBody::default());
        assert!(unknown.unwrap_err().contains("not found"));
        assert_eq!(stored(&window.state::<Session>()), None);
    }

    #[test]
    fn registration_keeps_the_database_in_the_local_app_data_folder() {
        let mut app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        // Tauri runs setup hooks on the event loop's first event; with the mock
        // runtime, only this deprecated call runs them. It is called once here.
        #[allow(deprecated)]
        app.run_iteration(events::ignore);
        let folder = app.path().app_local_data_dir().unwrap();
        assert_eq!(
            app.state::<Database>().path(),
            Some(folder.join(database::FILE_NAME))
        );
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

    /// Serves scripted responses, cancelling the session after each one.
    struct CancelsSession<'a>(&'a Session, Scripted);
    impl Transport for CancelsSession<'_> {
        async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
            let response = self.1.get(url).await;
            self.0.cancel();
            response
        }
    }

    #[test]
    fn cancelling_during_validation_sends_no_further_request() {
        let session = Session::default();
        let transport = CancelsSession(&session, Scripted::new(vec![Ok(EXPIRED.to_vec())]));
        let requests = extract_request_contexts(&cache(&["valid", "expired"])).unwrap();
        let token = session.begin();
        assert_eq!(
            run(validate_into(&session, &transport, &token, requests)),
            Err(Failure::Cancelled)
        );
        assert_eq!(transport.1.requested(), [url("expired")]);
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
