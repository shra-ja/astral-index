# Native shell

`src/main.rs` launches the real Tauri event loop. `build.rs` generates build
metadata; both are covered by native tests. `tauri.conf.json` defines bundled
assets, the development loopback URL and production CSP. No plugins, custom
commands or native capabilities are enabled yet.

Run commands from the repository root; see `../README.md`. Future services,
adapters and persistence follow `../docs/ARCHITECTURE.md`.

`src/lib.rs` is the shared library root with sibling HSR, storage, acquisition and discovery modules.
`src/hsr.rs` provides bounded, pure HSR response parsing.
It returns validated page/roll values and safe error categories. It has no native
commands, I/O, database, acquisition, or startup integration. See the response
contract and limits in [API research](../docs/HSR-API-RESEARCH.md).

`src/storage.rs` implements SQLite storage, immutable previews and atomic commits,
with a single initial schema in `migrations/001_initial.sql`. It creates compact
summaries and first-import provenance directly. Obsolete pre-release databases
are rejected unchanged and must be explicitly recreated; there is no upgrade chain. Tests use real temporary SQLite files. See
[decision 0003](../docs/decisions/0003-sqlite-import-foundations.md) and
[decision 0004](../docs/decisions/0004-compact-import-provenance.md) for identity,
conflict, provenance and migration policy. The library's native
path argument is not exposed to the webview; app-data path selection and typed
commands remain milestone 3 work.

`src/discovery.rs` reads bounded Windows player-log headers from supplied
roaming AppData or a selected log, with explicit WSL drive mapping.
`src/discovery/system.rs` resolves current-user roaming AppData through Windows'
Known Folder API or fixed Windows/WSL helpers. Invoke its asynchronous service
explicitly on a Tokio runtime with I/O and time enabled; it is not a startup task.
`src/acquisition.rs` resolves `data_2` in discovered game-data cache layouts and
extracts opaque request contexts. These native services do not fetch history or expose credentials
to the webview. Automatic extraction and a user-provided file fallback still
need desktop wiring; there is no discovered-cache or game-directory chooser.

Backend unit tests live in `#[cfg(test)] mod tests` beside their implementation
in `src/`, including private fault-injection tests. Cargo automatically discovers
public-API integration tests in `tests/acquisition.rs`, `tests/discovery.rs`,
`tests/system_discovery.rs` and `tests/storage.rs`;
synthetic fixtures remain in `tests/fixtures/`. Root-level
application end-to-end tests remain separate. No production API is widened for tests.

Pure parser tests live in `src/hsr.rs`. Filesystem and SQLite unit tests use strict
in-memory/scripted doubles in `src/acquisition/tests/` and `src/storage/tests/`;
these helpers are compiled only under `cfg(test)` and never create real files or
databases. System discovery additionally mocks environment, Known Folder and process
APIs in `src/discovery/system/tests/os.rs`, with a paused Tokio clock.
Integration tests exercise the real std/rusqlite bindings and Linux process pipes
using synthetic executables; they never query a real Windows profile. SQL doubles
check the query text, bound account/data values, ordering, commit and rollback
requests; real integration tests remain necessary to verify SQLite semantics.
Backend coverage must reach 100% from unit execution alone. Only the minimal
startup/build delegates have the explicitly guarded native-coverage exception
in [CONTRIBUTING](../CONTRIBUTING.md#coverage-is-a-blocking-gate).
