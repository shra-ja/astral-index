//! The mock debug binary's IPC trace: when each command reaches the native side
//! and when its answer is handed back to the webview, beside the end-to-end
//! tests' trace of when the webview sent it and got the answer, so a stalled test
//! shows which side waited. It writes Tauri's own IPC spans, which its `tracing`
//! feature opens in mock builds only, keeping their names, command and time but
//! never a request's arguments or a command's answer.

use tracing::Subscriber;
use tracing_subscriber::Layer;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::fmt::{MakeWriter, format::FmtSpan};
use tracing_subscriber::prelude::*;
use tracing_subscriber::registry::LookupSpan;

/// The spans Tauri opens as a command arrives, naming it, and as it answers.
const SPANS: [&str; 2] = ["ipc::request::handle", "ipc::request::respond"];

/// A subscriber writing a line, starting with the time, as each of those spans
/// opens.
pub fn subscriber<W>(writer: W) -> impl Subscriber + Send + Sync
where
    W: for<'w> MakeWriter<'w> + Send + Sync + 'static,
{
    let only_spans = filter_fn(|metadata| metadata.is_span() && SPANS.contains(&metadata.name()));
    tracing_subscriber::registry().with(lines(writer).with_filter(only_spans))
}

/// Writes a line, starting with the time, as any span opens or any event occurs.
fn lines<S, W>(writer: W) -> impl Layer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: for<'w> MakeWriter<'w> + Send + Sync + 'static,
{
    tracing_subscriber::fmt::layer()
        .with_writer(writer)
        .with_ansi(false)
        .with_span_events(FmtSpan::NEW)
}

/// Write the trace to stderr, which the end-to-end tests' log keeps, for the
/// rest of the process; once installed, later calls change nothing.
pub fn install() {
    let _ = tracing::subscriber::set_global_default(subscriber(std::io::stderr));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{PipeWriter, Read};
    use std::sync::Mutex;
    use tracing::trace_span;

    /// Held while a test's subscriber is its thread's default: with more than one
    /// at a time, tracing can cache whether a span is enabled from the wrong one.
    static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

    /// What `subscriber`, given a writer, writes while `steps` run.
    fn written<S: Subscriber + Send + Sync>(
        subscriber: impl FnOnce(Mutex<PipeWriter>) -> S,
        steps: impl FnOnce(),
    ) -> String {
        let _turn = ONE_AT_A_TIME.lock().unwrap();
        let (mut reader, writer) = std::io::pipe().unwrap();
        tracing::subscriber::with_default(subscriber(Mutex::new(writer)), steps);
        let mut text = String::new();
        reader.read_to_string(&mut text).unwrap();
        text
    }

    /// Writes every span and event, as the trace would without its filter.
    fn unfiltered(writer: Mutex<PipeWriter>) -> impl Subscriber + Send + Sync {
        tracing_subscriber::registry().with(lines(writer))
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
        let secrets = [
            "synthetic-argument",
            "synthetic-answer",
            "cacheFile",
            "an event",
        ];
        let text = written(subscriber, handle_one_command);
        let everything = written(unfiltered, handle_one_command);
        for secret in secrets {
            assert!(!text.contains(secret), "{secret} in {text}");
            // Without the filter, it would be written.
            assert!(everything.contains(secret), "{secret} not in {everything}");
        }
    }

    #[test]
    fn each_line_starts_with_the_time() {
        let text = written(subscriber, handle_one_command);
        assert!(!text.is_empty());
        for line in text.lines() {
            let time = line.split_whitespace().next().unwrap();
            assert!(chrono::DateTime::parse_from_rfc3339(time).is_ok(), "{line}");
        }
    }
}
