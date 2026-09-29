//! Request pacing: a pause before each request, to stay under HoYoverse's rate limit.
use super::{Transport, TransportError};
use std::time::Duration;

/// Wait before each request. HoYoverse answered `retcode -110` to unpaced requests.
pub const REQUEST_INTERVAL: Duration = Duration::from_millis(500);

/// Waits `REQUEST_INTERVAL` before each request of the inner transport. Wrap it
/// inside `Cancellable`, so cancelling interrupts the pause.
pub struct Paced<'a, T> {
    transport: &'a T,
}
impl<'a, T> Paced<'a, T> {
    pub fn new(transport: &'a T) -> Self {
        Self { transport }
    }
}
impl<T: Transport + Sync> Transport for Paced<'_, T> {
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        tokio::time::sleep(REQUEST_INTERVAL).await;
        self.transport.get(url).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::Cancellable;
    use crate::acquisition::tests::scripted::Scripted;
    use std::future::Future;
    use tokio::time::{Instant, sleep};
    use tokio_util::sync::CancellationToken;

    // A paused clock advances only while every task waits, so delays are exact.
    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(future)
    }
    fn ok() -> Result<Vec<u8>, TransportError> {
        Ok(b"body".to_vec())
    }

    #[test]
    fn each_request_waits_the_interval_first() {
        let transport = Scripted::new(vec![ok(), Err(TransportError::Timeout)]);
        let elapsed = run(async {
            let started = Instant::now();
            let paced = Paced::new(&transport);
            assert_eq!(paced.get("a").await, ok());
            let first = started.elapsed();
            assert_eq!(paced.get("b").await, Err(TransportError::Timeout));
            (first, started.elapsed())
        });
        assert_eq!(elapsed, (REQUEST_INTERVAL, REQUEST_INTERVAL * 2));
        assert_eq!(transport.requested(), ["a", "b"]);
    }

    #[test]
    fn cancelling_during_the_pause_sends_nothing() {
        let transport = Scripted::new(vec![ok()]);
        let token = CancellationToken::new();
        let result = run(async {
            let cancel = token.clone();
            tokio::spawn(async move {
                sleep(REQUEST_INTERVAL / 2).await;
                cancel.cancel();
            });
            Cancellable::new(&Paced::new(&transport), &token)
                .get("a")
                .await
        });
        assert_eq!(result, Err(TransportError::Cancelled));
        assert!(transport.requested().is_empty());
    }
}
