//! Runs "blocking" work inline, so it sees the calling thread's filesystem and SQL
//! doubles. A panic is caught, as Tokio's blocking pool reports one. The real
//! thread hop is covered by the database integration test.
use std::{
    future::{Future, ready},
    panic::{AssertUnwindSafe, catch_unwind},
};

pub fn spawn_blocking<T>(work: impl FnOnce() -> T) -> impl Future<Output = Result<T, ()>> {
    ready(catch_unwind(AssertUnwindSafe(work)).map_err(drop))
}
