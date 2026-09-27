//! Desktop IPC: narrow commands that return safe categories; request contexts stay native.
use crate::acquisition::{CacheError, RequestContext, extract_request_contexts};
use crate::discovery::{
    ExtractionError,
    system::{DiscoveryError, extract_current_user_contexts},
};
use serde::Serialize;
use std::sync::{Mutex, PoisonError};
use tauri::{
    Builder, Runtime, State,
    ipc::{InvokeBody, Request},
};

/// Shared with `build.rs`, whose app manifest makes each command require a capability grant.
pub const COMMANDS: &[&str] = include!("desktop/commands.in");

/// Safe failure categories for the webview. Paths, source text and credentials never cross IPC.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Failure {
    UnsupportedHost,
    DiscoveryFailed,
    NoGameData,
    NoCache,
    NoRequest,
    FileTooLarge,
    InvalidFile,
}

/// Contexts from the latest extraction, held only in memory for the next acquisition.
/// Each extraction replaces them, and a failed extraction leaves none.
#[derive(Default)]
pub struct Session {
    contexts: Mutex<Option<Vec<RequestContext>>>,
}
impl Session {
    fn store(&self, result: Result<Vec<RequestContext>, Failure>) -> Result<(), Failure> {
        let mut contexts = self.contexts.lock().unwrap_or_else(PoisonError::into_inner);
        *contexts = None;
        *contexts = Some(result?);
        Ok(())
    }
}

// Separate from state management so tests can check commands fail safely without it.
fn handle_commands<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        extract_automatically,
        extract_from_file
    ])
}

/// Register the desktop commands and their in-memory session.
pub fn register<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    handle_commands(builder.manage(Session::default()))
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

// Bounded cache and log reads run synchronously on the async worker running this command.
async fn extract_into(session: &Session) -> Result<(), Failure> {
    session.store(extract_current_user_contexts().await.map_err(Failure::from))
}

#[tauri::command]
async fn extract_automatically(session: State<'_, Session>) -> Result<(), Failure> {
    extract_into(&session).await
}

/// The webview sends the selected file's bytes as a raw body; no path crosses IPC.
#[tauri::command]
async fn extract_from_file(
    request: Request<'_>,
    session: State<'_, Session>,
) -> Result<(), Failure> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return session.store(Err(Failure::InvalidFile));
    };
    session.store(extract_request_contexts(bytes).map_err(|error| {
        if error == CacheError::TooLarge {
            Failure::FileTooLarge
        } else {
            Failure::NoRequest
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::MAX_CACHE_BYTES;
    use crate::acquisition::tests::filesystem;
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

    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(future)
    }
    fn cache(key: &str) -> Vec<u8> {
        format!(
            "1/0/{ENDPOINT}authkey={key}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0"
        )
        .into_bytes()
    }
    fn window() -> WebviewWindow<MockRuntime> {
        let app = register(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap()
    }
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
    fn stored(window: &WebviewWindow<MockRuntime>) -> Option<Vec<RequestContext>> {
        window.state::<Session>().contexts.lock().unwrap().take()
    }

    #[test]
    fn registers_exactly_the_manifest_commands_and_rejects_others() {
        let window = window();
        assert_eq!(COMMANDS, ["extract_automatically", "extract_from_file"]);
        // Host discovery is unsupported here: the unit-test OS double reports plain Linux.
        assert_eq!(
            invoke(&window, COMMANDS[0], InvokeBody::default()),
            Err("\"unsupported_host\"".into())
        );
        assert_eq!(
            invoke(&window, COMMANDS[1], InvokeBody::default()),
            Err("\"invalid_file\"".into())
        );
        let unknown = invoke(&window, "read_arbitrary_file", InvokeBody::default());
        assert!(unknown.unwrap_err().contains("not found"));
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
            let error = invoke(&window, command, InvokeBody::Raw(cache("synthetic")));
            assert!(error.unwrap_err().contains("state not managed"));
        }
    }

    #[test]
    fn file_extraction_keeps_contexts_native_and_replaces_earlier_results() {
        let window = window();
        assert_eq!(
            invoke(
                &window,
                "extract_from_file",
                InvokeBody::Raw(cache("synthetic"))
            ),
            Ok(())
        );
        assert_eq!(
            stored(&window).unwrap(),
            crate::acquisition::extract_request_contexts(&cache("synthetic")).unwrap()
        );
        invoke(
            &window,
            "extract_from_file",
            InvokeBody::Raw(cache("earlier")),
        )
        .unwrap();
        assert_eq!(
            invoke(
                &window,
                "extract_from_file",
                InvokeBody::Raw(b"no request".to_vec())
            ),
            Err("\"no_request\"".into())
        );
        assert_eq!(stored(&window), None);
        invoke(
            &window,
            "extract_from_file",
            InvokeBody::Raw(cache("earlier")),
        )
        .unwrap();
        assert_eq!(
            invoke(
                &window,
                "extract_from_file",
                InvokeBody::Raw(vec![0; MAX_CACHE_BYTES + 1])
            ),
            Err("\"file_too_large\"".into())
        );
        assert_eq!(stored(&window), None);
    }

    #[test]
    fn automatic_extraction_stores_discovered_contexts_or_a_safe_failure() {
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
                    PathBuf::from("/volumes/games/Star Rail/webCaches/Cache/Cache_Data/data_2"),
                    cache("discovered"),
                ),
            ]
            .into(),
            entries: Some(vec![]),
            ..Default::default()
        });
        let session = Session::default();
        assert_eq!(run(extract_into(&session)), Ok(()));
        assert_eq!(
            session.contexts.lock().unwrap().take().unwrap(),
            crate::acquisition::extract_request_contexts(&cache("discovered")).unwrap()
        );
    }

    #[test]
    fn extraction_errors_map_to_safe_categories() {
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
    }
}
