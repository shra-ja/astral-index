//! The acquisition's retry budget: one delayed retry per transiently failed request.
use super::{Transport, TransportError, transport_failure};
use std::{
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

/// Extra attempts allowed across one acquisition, from validation through pagination.
pub const MAX_RETRIES: u32 = 2;
/// Wait before retrying a transiently failed request.
pub const RETRY_DELAY: Duration = Duration::from_secs(1);

/// Extra attempts left for one acquisition. Share one budget across every request.
pub struct RetryBudget {
    remaining: AtomicU32,
}
impl Default for RetryBudget {
    fn default() -> Self {
        Self {
            remaining: AtomicU32::new(MAX_RETRIES),
        }
    }
}
impl RetryBudget {
    pub fn remaining(&self) -> u32 {
        self.remaining.load(Ordering::SeqCst)
    }
    /// Spend one extra attempt, if any are left.
    fn take(&self) -> bool {
        self.remaining
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            })
            .is_ok()
    }
}

/// Retries a transient failure of the inner transport once, within the budget.
pub struct Retrying<'a, T> {
    transport: &'a T,
    budget: &'a RetryBudget,
}
impl<'a, T> Retrying<'a, T> {
    pub fn new(transport: &'a T, budget: &'a RetryBudget) -> Self {
        Self { transport, budget }
    }
}
impl<T: Transport + Sync> Transport for Retrying<'_, T> {
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        match self.transport.get(url).await {
            Err(error) if transport_failure(error).is_transient() && self.budget.take() => {
                tokio::time::sleep(RETRY_DELAY).await;
                self.transport.get(url).await
            }
            response => response,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::scripted::Scripted;
    use std::future::Future;
    use tokio::time::Instant;

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
    const TRANSIENT: Result<Vec<u8>, TransportError> = Err(TransportError::Status(503));

    #[test]
    fn a_transient_failure_is_retried_once_after_the_delay() {
        let transport = Scripted::new(vec![Err(TransportError::Timeout), ok()]);
        let budget = RetryBudget::default();
        let started = run(async {
            let started = Instant::now();
            let body = Retrying::new(&transport, &budget).get("same").await;
            assert_eq!(body, ok());
            started.elapsed()
        });
        assert_eq!(started, RETRY_DELAY);
        assert_eq!(transport.requested(), ["same", "same"]);
        assert_eq!(budget.remaining(), MAX_RETRIES - 1);
    }

    #[test]
    fn a_failed_retry_is_not_retried_again() {
        let transport = Scripted::new(vec![TRANSIENT, Err(TransportError::Connection)]);
        let budget = RetryBudget::default();
        let result = run(Retrying::new(&transport, &budget).get("url"));
        assert_eq!(result, Err(TransportError::Connection));
        assert_eq!(transport.requested().len(), 2);
    }

    #[test]
    fn retries_are_shared_across_requests_up_to_the_budget() {
        let transport = Scripted::new(vec![TRANSIENT, ok(), TRANSIENT, ok(), TRANSIENT]);
        let budget = RetryBudget::default();
        let elapsed = run(async {
            let started = Instant::now();
            let retrying = Retrying::new(&transport, &budget);
            assert_eq!(retrying.get("a").await, ok());
            assert_eq!(retrying.get("b").await, ok());
            assert_eq!(retrying.get("c").await, TRANSIENT);
            started.elapsed()
        });
        assert_eq!(elapsed, RETRY_DELAY * MAX_RETRIES);
        assert_eq!(transport.requested(), ["a", "a", "b", "b", "c"]);
        assert_eq!(budget.remaining(), 0);
    }

    #[test]
    fn other_outcomes_are_returned_at_once_without_spending_the_budget() {
        for response in [
            ok(),
            Err(TransportError::Status(429)),
            Err(TransportError::Status(302)),
            Err(TransportError::TooLarge),
            Err(TransportError::UnsupportedUrl),
            Err(TransportError::Unavailable),
        ] {
            let transport = Scripted::new(vec![response.clone()]);
            let budget = RetryBudget::default();
            let elapsed = run(async {
                let started = Instant::now();
                assert_eq!(
                    Retrying::new(&transport, &budget).get("url").await,
                    response
                );
                started.elapsed()
            });
            assert_eq!(elapsed, Duration::ZERO);
            assert_eq!(transport.requested().len(), 1);
            assert_eq!(budget.remaining(), MAX_RETRIES);
        }
    }
}
