//! HTTPS transport for the history endpoint, bounded in time, bytes and redirects.
use super::ENDPOINT;
use crate::hsr::MAX_RESPONSE_BYTES;
use std::{future::Future, time::Duration};

#[cfg(test)]
use tests::http::{self, default_provider};
#[cfg(not(test))]
use {reqwest as http, rustls::crypto::ring::default_provider};

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Safe transport failures; URLs, credentials and response text are never included.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransportError {
    /// Not the exact history endpoint; nothing was sent.
    UnsupportedUrl,
    /// The HTTPS client could not be created.
    Unavailable,
    Timeout,
    Connection,
    /// Any status other than 200, including redirects, which are never followed.
    Status(u16),
    /// The body exceeded the response bound; reading stopped.
    TooLarge,
}

/// Fetch one history response. Implemented over HTTPS and by scripted test doubles.
pub trait Transport {
    fn get(&self, url: &str) -> impl Future<Output = Result<Vec<u8>, TransportError>> + Send;
}

pub struct HttpTransport {
    client: http::Client,
}
impl HttpTransport {
    /// Build the only client allowed to reach the history endpoint: HTTPS only, no
    /// redirects, no system proxy, finite timeouts and the OS certificate store.
    pub fn new() -> Result<Self, TransportError> {
        // reqwest uses the process-wide rustls provider; keep one installed earlier.
        let _ = default_provider().install_default();
        let client = http::Client::builder()
            .https_only(true)
            .redirect(http::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|_| TransportError::Unavailable)?;
        Ok(Self { client })
    }
}
impl Transport for HttpTransport {
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        if !url.starts_with(ENDPOINT) {
            return Err(TransportError::UnsupportedUrl);
        }
        let mut response = self.client.get(url).send().await.map_err(failure)?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(TransportError::Status(status));
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(failure)? {
            if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
                return Err(TransportError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}

fn failure(error: http::Error) -> TransportError {
    if error.is_timeout() {
        TransportError::Timeout
    } else {
        TransportError::Connection
    }
}

#[cfg(test)]
mod tests {
    pub(super) mod http;
    use super::*;
    use http::{Error, Fixture, Plan};

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    fn url() -> String {
        format!(
            "{ENDPOINT}authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type=1&page=1&size=1000&end_id=0"
        )
    }
    fn respond(plans: Vec<Result<Plan, Error>>) -> HttpTransport {
        http::install(Fixture {
            responses: plans.into(),
            ..Default::default()
        });
        HttpTransport::new().unwrap()
    }
    fn ok(chunks: Vec<Vec<u8>>) -> Result<Plan, Error> {
        Ok(Plan {
            status: 200,
            chunks: chunks.into_iter().map(Ok).collect(),
        })
    }

    #[test]
    fn client_is_https_only_never_redirects_and_has_finite_timeouts() {
        http::install(Fixture::default());
        HttpTransport::new().unwrap();
        http::inspect(|state| {
            assert_eq!(state.provider_installs, 1);
            assert_eq!(state.https_only, Some(true));
            assert!(state.no_redirects);
            assert_eq!(state.connect_timeout, Some(CONNECT_TIMEOUT));
            assert_eq!(state.timeout, Some(REQUEST_TIMEOUT));
        });
        http::install(Fixture {
            build_error: true,
            ..Default::default()
        });
        assert!(matches!(
            HttpTransport::new(),
            Err(TransportError::Unavailable)
        ));
    }

    #[test]
    fn only_the_exact_endpoint_is_requested() {
        let transport = respond(vec![]);
        for other in [
            url().replace("https:", "http:"),
            url().replace(".com/", ".com.evil/"),
            url().replace(".com/", ".com:443/"),
            "https://example.com/".to_owned(),
            String::new(),
        ] {
            assert_eq!(
                run(transport.get(&other)),
                Err(TransportError::UnsupportedUrl)
            );
        }
        http::inspect(|state| assert!(state.requested.is_empty()));
    }

    #[test]
    fn successful_bodies_are_joined_from_chunks() {
        let transport = respond(vec![ok(vec![b"{\"ret".to_vec(), b"code\":0}".to_vec()])]);
        assert_eq!(run(transport.get(&url())).unwrap(), b"{\"retcode\":0}");
        http::inspect(|state| assert_eq!(state.requested, [url()]));
    }

    #[test]
    fn other_statuses_fail_without_reading_the_body() {
        let plans = [302, 429, 503]
            .map(|status| {
                Ok(Plan {
                    status,
                    chunks: vec![Ok(b"private".to_vec())],
                })
            })
            .into();
        let transport = respond(plans);
        for status in [302, 429, 503] {
            assert_eq!(
                run(transport.get(&url())),
                Err(TransportError::Status(status))
            );
        }
        http::inspect(|state| assert_eq!(state.chunks_read, 0));
    }

    #[test]
    fn send_and_read_failures_are_classified_without_detail() {
        let transport = respond(vec![
            Err(Error { timeout: true }),
            Err(Error { timeout: false }),
            Ok(Plan {
                status: 200,
                chunks: vec![Ok(b"{".to_vec()), Err(Error { timeout: true })],
            }),
            Ok(Plan {
                status: 200,
                chunks: vec![Err(Error { timeout: false })],
            }),
        ]);
        for expected in [
            TransportError::Timeout,
            TransportError::Connection,
            TransportError::Timeout,
            TransportError::Connection,
        ] {
            assert_eq!(run(transport.get(&url())), Err(expected));
        }
    }

    #[test]
    fn bodies_are_bounded_while_receiving() {
        let half = vec![b'x'; MAX_RESPONSE_BYTES / 2];
        let transport = respond(vec![
            ok(vec![half.clone(), half.clone()]),
            ok(vec![
                half.clone(),
                half.clone(),
                b"x".to_vec(),
                b"unread".to_vec(),
            ]),
        ]);
        assert_eq!(
            run(transport.get(&url())).unwrap().len(),
            MAX_RESPONSE_BYTES
        );
        http::install(Fixture {
            responses: vec![ok(vec![
                half.clone(),
                half,
                b"x".to_vec(),
                b"unread".to_vec(),
            ])]
            .into(),
            ..Default::default()
        });
        assert_eq!(run(transport.get(&url())), Err(TransportError::TooLarge));
        http::inspect(|state| assert_eq!(state.chunks_read, 3));
    }
}
