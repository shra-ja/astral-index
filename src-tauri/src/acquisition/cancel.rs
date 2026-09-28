//! User cancellation: stop a request in flight and send nothing further.
use super::{Transport, TransportError};
use tokio_util::sync::CancellationToken;

/// Stops the inner transport once the token is cancelled. Wrap it outermost, so a
/// retry delay is interrupted too.
pub struct Cancellable<'a, T> {
    transport: &'a T,
    token: &'a CancellationToken,
}
impl<'a, T> Cancellable<'a, T> {
    pub fn new(transport: &'a T, token: &'a CancellationToken) -> Self {
        Self { transport, token }
    }
}
impl<T: Transport + Sync> Transport for Cancellable<'_, T> {
    /// A cancelled token sends nothing; cancelling later drops the request in flight.
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        self.token
            .run_until_cancelled(self.transport.get(url))
            .await
            .unwrap_or(Err(TransportError::Cancelled))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::scripted::Scripted;
    use crate::acquisition::{
        AcquisitionError, ENDPOINT, FetchFailure, RETRY_DELAY, RetryBudget, Retrying,
        extract_request_contexts, fetch_history, validate,
    };
    use std::{future::Future, sync::Mutex, time::Duration};
    use tokio::time::{Instant, sleep};

    const PAGE: &[u8] = include_bytes!("../../tests/fixtures/hsr-api/page.json");
    const EXPIRED: &[u8] = br#"{"retcode":-101,"message":"synthetic","data":null}"#;

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(future)
    }
    /// Cancel `token` after `delay` on the paused clock.
    fn cancel_after(token: &CancellationToken, delay: Duration) {
        let token = token.clone();
        tokio::spawn(async move {
            sleep(delay).await;
            token.cancel();
        });
    }

    /// Never answers, as a slow server would. It records each request when called,
    /// and returns a future with no code after its endless wait.
    #[derive(Default)]
    struct Hanging(Mutex<Vec<String>>);
    impl Transport for Hanging {
        fn get(&self, url: &str) -> impl Future<Output = Result<Vec<u8>, TransportError>> + Send {
            self.0.lock().unwrap().push(url.to_owned());
            std::future::pending()
        }
    }

    /// Serves scripted responses, cancelling the token as it serves the last one.
    struct CancelsAtEnd<'a> {
        inner: Scripted,
        remaining: Mutex<usize>,
        token: &'a CancellationToken,
    }
    impl Transport for CancelsAtEnd<'_> {
        async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
            let response = self.inner.get(url).await;
            let mut remaining = self.remaining.lock().unwrap();
            *remaining -= 1;
            if *remaining == 0 {
                self.token.cancel();
            }
            response
        }
    }
    fn cancels_at_end<'a>(bodies: &[&[u8]], token: &'a CancellationToken) -> CancelsAtEnd<'a> {
        CancelsAtEnd {
            inner: Scripted::new(bodies.iter().map(|body| Ok(body.to_vec())).collect()),
            remaining: Mutex::new(bodies.len()),
            token,
        }
    }

    #[test]
    fn a_cancelled_token_sends_nothing() {
        let transport = Scripted::new(vec![]);
        let token = CancellationToken::new();
        token.cancel();
        let result = run(Cancellable::new(&transport, &token).get("url"));
        assert_eq!(result, Err(TransportError::Cancelled));
        assert!(transport.requested().is_empty());
    }

    #[test]
    fn cancelling_abandons_a_request_in_flight() {
        let transport = Hanging::default();
        let token = CancellationToken::new();
        let elapsed = run(async {
            cancel_after(&token, Duration::from_secs(3));
            let started = Instant::now();
            let result = Cancellable::new(&transport, &token).get("url").await;
            assert_eq!(result, Err(TransportError::Cancelled));
            started.elapsed()
        });
        assert_eq!(elapsed, Duration::from_secs(3));
        assert_eq!(*transport.0.lock().unwrap(), ["url"]);
    }

    #[test]
    fn cancelling_interrupts_a_retry_delay() {
        let transport = Scripted::new(vec![Err(TransportError::Timeout)]);
        let budget = RetryBudget::default();
        let token = CancellationToken::new();
        let elapsed = run(async {
            cancel_after(&token, RETRY_DELAY / 2);
            let started = Instant::now();
            let retrying = Retrying::new(&transport, &budget);
            let result = Cancellable::new(&retrying, &token).get("url").await;
            assert_eq!(result, Err(TransportError::Cancelled));
            started.elapsed()
        });
        assert_eq!(elapsed, RETRY_DELAY / 2);
        assert_eq!(transport.requested().len(), 1);
    }

    #[test]
    fn uncancelled_responses_pass_through() {
        for response in [Ok(b"body".to_vec()), Err(TransportError::Status(503))] {
            let transport = Scripted::new(vec![response.clone()]);
            let token = CancellationToken::new();
            let result = run(Cancellable::new(&transport, &token).get("url"));
            assert_eq!(result, response);
        }
    }

    #[test]
    fn cancelling_stops_validation_and_pagination_before_the_next_request() {
        let cache = format!(
            "1/0/{ENDPOINT}authkey=b&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0\
             1/0/{ENDPOINT}authkey=a&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0"
        );
        let requests = || extract_request_contexts(cache.as_bytes()).unwrap();
        // The first key expires; the second is never tried.
        let token = CancellationToken::new();
        let transport = cancels_at_end(&[EXPIRED], &token);
        let result = run(validate(&Cancellable::new(&transport, &token), requests()));
        assert_eq!(result.unwrap_err(), FetchFailure::Cancelled);
        assert_eq!(transport.inner.requested().len(), 1);
        // Two of six categories are retrieved, and nothing is returned.
        let token = CancellationToken::new();
        let transport = cancels_at_end(&[PAGE, PAGE], &token);
        let context = requests().remove(0).into_context();
        let result = run(fetch_history(
            &Cancellable::new(&transport, &token),
            &context,
        ));
        assert_eq!(
            result.unwrap_err(),
            AcquisitionError::Fetch(FetchFailure::Cancelled)
        );
        assert_eq!(transport.inner.requested().len(), 2);
    }
}
