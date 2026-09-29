//! Event-loop callbacks for tests driving the mock runtime.
use tauri::{AppHandle, RunEvent, Runtime};

/// Ignore events; the mock runtime's iteration delivers none.
pub fn ignore<R: Runtime>(_: &AppHandle<R>, _: RunEvent) {}
