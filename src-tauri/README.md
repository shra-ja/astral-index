# Native backend

The Rust crate behind the desktop app: Tauri startup, the native commands and
the services they compose. See [ARCHITECTURE](../docs/architecture/ARCHITECTURE.md)
for how the parts fit together; run commands from the repository root.

- `src/main.rs` and `src/bin/astral-index-mock.rs` only hand a builder to
  unit-tested registration in `src/desktop.rs`: the real app, and the mock debug
  binary with its synthetic HoYoverse. `build.rs` generates build metadata and
  the app command manifest from `src/desktop/commands.in`. These three files are
  the guarded coverage exception in
  [CONTRIBUTING](../CONTRIBUTING.md#coverage-is-a-blocking-gate).
- `src/desktop.rs` holds the commands, the acquisition session and window setup;
  `src/desktop/database.rs` chooses the database location and runs SQLite work
  off the async workers.
- `src/discovery.rs` reads player-log headers and `src/discovery/system.rs`
  finds the current user's AppData on Windows and from WSL.
- `src/acquisition.rs` reads cache files and extracts request contexts; its
  submodules build requests (`request.rs`), send them (`transport.rs`), classify
  outcomes (`outcome.rs`), validate keys (`validation.rs`), paginate
  (`pagination.rs`), retry (`retry.rs`), pace (`pace.rs`) and cancel
  (`cancel.rs`). `mock.rs` is the mock binary's synthetic HoYoverse.
- `src/hsr.rs` parses and validates HSR API response pages.
- `src/storage.rs` holds SQLite storage: previews, commits and history reads,
  with the single schema in `migrations/001_initial.sql`.
- `tauri.conf.json` sets bundled assets, the dev URL and the production CSP;
  `capabilities/main.json` grants the main window exactly the app's commands.

Unit tests sit in `#[cfg(test)] mod tests` beside their code, with test doubles
for files, SQLite, OS APIs, transports and Tokio's blocking pool in `tests/`
subfolders compiled only for tests. Integration tests in `tests/` use the real
boundaries, with synthetic fixtures in `tests/fixtures/`
([rules](tests/fixtures/README.md)). See
[TESTING](../docs/development/TESTING.md).
