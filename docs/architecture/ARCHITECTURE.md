# Architecture

Roll Tracker is one locally run desktop application: a Vue 3 and TypeScript
webview (`src-ui/`) in a Tauri 2 shell with a Rust backend (`src-tauri/`) and a
local SQLite database. There is no local HTTP server, project-hosted backend,
account system or telemetry. Node.js and Rust are managed with asdf. Consequential
choices are recorded as [decisions](decisions/DECISIONS.md).

## Areas

Open the file for the area being changed. Status says how much of it exists:
**implemented** describes the code as it is; **partially implemented** marks
which parts are still design; **tentative** is design only, to be revisited when
the work starts.

| Area | Covers | Status |
| --- | --- | --- |
| [Discovery and extraction](discovery.md) | Finding the game's cached request context on Windows and WSL, or in a chosen file | Implemented (Star Rail) |
| [Acquisition](acquisition.md) | Validating auth keys and retrieving history from HoYoverse: transport, retries, pacing, cancellation, pagination, quick refresh | Implemented (Star Rail) |
| [Imports](imports.md) | The adapter contract and the shared import pipeline | Partially implemented: API imports; file imports and the second game are tentative |
| [Storage](storage.md) | The database, its location and portable mode, the model, preview and commit, history reads | Implemented; coverage and game metadata tentative |
| [Desktop commands](desktop-commands.md) | The native command surface, the acquisition session and IPC rules | Implemented |
| [Frontend](frontend.md) | The webview's layers and rules | Implemented |
| [Statistics](statistics.md) | Pity and guarantee rules, derived on read | Tentative |

## Boundaries

```text
Webview (src-ui/): screens, flows, typed command client
    | narrow typed Tauri commands; categories and counts, never secrets
Rust services (src-tauri/src/)
    |-- discovery: player logs and caches, read-only
    |-- acquisition: user-requested HoYoverse requests and pagination
    |-- game adapters: detection, parsing, normalization, banner rules
    |-- storage: validation, preview, deduplication, transactional commit, reads
    `-- statistics: evidence-aware calculations (tentative)
SQLite database in the app's data folder
```

- Rust is authoritative for file access, validation, persistence and domain
  logic; the webview calls a narrow, typed command interface and renders results.
- Keep presentation, game rules, parsing, persistence and OS discovery separate.
  Parsing and game logic are testable without Tauri or UI state.
- Start with concrete adapters and a small shared contract, not a plugin framework.
- Network access is native only, user-requested only, and limited to the history
  endpoints; the webview's CSP blocks every network origin.
- Files are data, never code. Bundle all UI resources and game metadata, with
  explicit versions; no remote assets.

## Testability

Domain logic does not depend on webview startup. Clocks, file readers, SQLite,
OS lookups and transports are injected or replaced by test doubles, so success and
failure paths are tested in unit tests; integration tests exercise the real
boundaries. Unit tests alone must reach 100% coverage. See
[CONTRIBUTING](../../CONTRIBUTING.md#test-driven-development) and
[TESTING](../development/TESTING.md).
