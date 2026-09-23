# Native shell

`src/main.rs` launches the real Tauri event loop. `build.rs` generates build
metadata; both are covered by native tests. `tauri.conf.json` defines bundled
assets, the development loopback URL and production CSP. No plugins, custom
commands or native capabilities are enabled yet.

Run commands from the repository root; see `../README.md`. Future services,
adapters and persistence follow `../docs/ARCHITECTURE.md`.

`src/hsr.rs` is the pure Rust library target for bounded HSR response parsing.
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

Backend tests and fixtures live in `tests/` within this Rust package. Cargo
finds `tests/hsr.rs` automatically. The storage tests in `tests/storage/` run as
library test modules so they can test private failure boundaries without widening
the production API. Root-level application end-to-end tests remain separate.
