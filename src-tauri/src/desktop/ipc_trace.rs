//! The mock debug binary's IPC trace: when each command reaches the native side
//! and when its answer is handed back to the webview, beside the end-to-end
//! tests' trace of when the webview sent it and got the answer, so a stalled test
//! shows which side waited. It writes Tauri's own IPC spans, which its `tracing`
//! feature opens in mock builds only, keeping their names, command and time but
//! never a request's arguments or a command's answer.

use tracing::Subscriber;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::fmt::{MakeWriter, format::FmtSpan};
use tracing_subscriber::prelude::*;

/// The spans Tauri opens as a command arrives, naming it, and as it answers.
const SPANS: [&str; 2] = ["ipc::request::handle", "ipc::request::respond"];

/// A subscriber writing a line, starting with the time, as each of those spans
/// opens.
pub fn subscriber<W>(writer: W) -> impl Subscriber + Send + Sync
where
    W: for<'w> MakeWriter<'w> + Send + Sync + 'static,
{
    let layer = tracing_subscriber::fmt::layer()
        .with_writer(writer)
        .with_ansi(false)
        .with_span_events(FmtSpan::NEW)
        .with_filter(filter_fn(|metadata| {
            metadata.is_span() && SPANS.contains(&metadata.name())
        }));
    tracing_subscriber::registry().with(layer)
}

/// Write the trace to stderr, which the end-to-end tests' log keeps, for the
/// rest of the process; once installed, later calls change nothing.
pub fn install() {
    let _ = tracing::subscriber::set_global_default(subscriber(std::io::stderr));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use tracing::trace_span;

    /// What `subscriber`, given a writer, writes while `steps` run.
    fn written<S, F>(subscriber: F, steps: impl FnOnce()) -> String
    where
        S: Subscriber + Send + Sync,
        F: FnOnce(Box<dyn Fn() -> std::io::PipeWriter + Send + Sync>) -> S,
    {
        let (mut reader, writer) = std::io::pipe().unwrap();
        let writers = Box::new(move || writer.try_clone().unwrap());
        tracing::subscriber::with_default(subscriber(writers), steps);
        let mut text = String::new();
        reader.read_to_string(&mut text).unwrap();
        text
    }

    /// Writes every span and event, as the trace would without its filter.
    fn unfiltered(
        writer: Box<dyn Fn() -> std::io::PipeWriter + Send + Sync>,
    ) -> impl Subscriber + Send + Sync {
        tracing_subscriber::fmt()
            .with_writer(writer)
            .with_ansi(false)
            .with_max_level(tracing::Level::TRACE)
            .with_span_events(FmtSpan::NEW)
            .finish()
    }

    /// The spans Tauri 2.12's custom protocol opens for one command, as in its
    /// `ipc::protocol`, with a request body and an answer the trace must not
    /// write, then a span and an event of other kinds.
    fn handle_one_command() {
        let request = trace_span!("ipc::request", request = "synthetic-argument").entered();
        let handle = trace_span!("ipc::request::handle", cmd = "extract_from_file");
        trace_span!(parent: &handle, "ipc::request::respond").in_scope(|| {
            let _response =
                trace_span!("ipc::request::response", response = "synthetic-answer").entered();
        });
        drop(request);
        let _other = trace_span!("ipc::request::deserialize_arg", arg = "cacheFile").entered();
        tracing::error!("an event, not a span");
    }

    #[test]
    fn the_trace_writes_when_a_command_arrives_and_answers() {
        let text = written(subscriber, handle_one_command);
        let lines: Vec<_> = text.lines().collect();
        assert_eq!(lines.len(), 2, "{lines:#?}");
        assert!(lines[0].contains("ipc::request::handle{cmd=\"extract_from_file\"}"));
        assert!(lines[1].contains("ipc::request::respond"));
        assert!(lines[1].contains("extract_from_file"));
    }

    #[test]
    fn the_trace_never_writes_arguments_answers_or_other_spans() {
        let hidden = [
            "synthetic-argument",
            "synthetic-answer",
            "cacheFile",
            "an event",
        ];
        let text = written(subscriber, handle_one_command);
        let everything = written(unfiltered, handle_one_command);
        for hidden in hidden {
            assert!(!text.contains(hidden), "{hidden} in {text}");
            // Without the filter, it would be written.
            assert!(everything.contains(hidden), "{hidden} not in {everything}");
        }
    }

    #[test]
    fn each_line_starts_with_the_time() {
        let text = written(subscriber, handle_one_command);
        let year = chrono::Utc::now().format("%Y-").to_string();
        assert!(!text.is_empty());
        assert!(text.lines().all(|line| line.starts_with(&year)));
    }
}
