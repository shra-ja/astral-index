# Architecture

The shell uses vanilla TypeScript, Vite/npm and Tauri 2; see decision 0001.
Node.js and Rust are managed with asdf. The import/storage/service design below
is implemented for the HSR response adapter and SQLite import services described below; acquisition and UI integration remain proposals. Instrumentation is documented in `TESTING.md`.

## Boundaries

```text
Web UI (src/)
    | typed Tauri commands and results
Rust application services (src-tauri/src/)
    |-- source readers: selected files and read-only installation discovery
    |-- acquisition client: user-requested HoYoverse API calls and pagination
    |-- game adapters: detection, parsing, normalization, banner rules
    |-- import service: validation, preview, deduplication, transaction
    |-- history/statistics service: queries and evidence-aware calculations
    `-- persistence: local database, migrations, backup/restore
```

Use one application, without a local HTTP server or a project-hosted backend.
Keep parsing and game logic testable independently of Tauri and UI state. Start with concrete
adapters and a small shared contract rather than a general plugin framework.

## User-requested history acquisition

[Decision 0002](decisions/0002-user-requested-history-acquisition.md) permits
HoYoverse requests only in response to an explicit user action. A single action
may initiate a bounded, cancellable sequence of validation and paginated history
requests. No startup fetches, background polling, or scheduled synchronization.

The Rust acquisition client uses extracted request context, validates HTTPS
hosts/paths and redirects, bounds timeouts/responses/attempts, and keeps auth keys
out of frontend state and logs. Game adapters interpret responses; validated
records enter the shared preview and transactional import pipeline. Network or
authentication failures must not corrupt existing history. HTTP library choice,
retry policy, and credential retention remain implementation decisions.

The webview keeps its restrictive CSP and calls a narrow typed native command;
no arbitrary URL-fetch or shell capability is exposed. The current shell has no
acquisition client. Its isolated native test remains useful for checking local
operation and blocked webview fetches, not as proof that history can be acquired
without a connection. Automated tests must stay local and self-contained.
Network-client tests use HTTP mocks or isolated local test servers with synthetic responses, including
errors and cancellation; no live API calls or player credentials.

## Testability requirements

Follow `../CONTRIBUTING.md`: test-first implementation and 100% coverage are
mandatory. Keep domain logic independent of webview startup and inject clocks,
file readers, and other nondeterministic boundaries so success and failure paths
can be tested. Exercise persistence and native boundaries with integration tests;
do not exclude handwritten native glue or UI components from coverage. Select
tooling capable of measuring all required metrics before adding application code.

## Storage proposal

SQLite through pinned `rusqlite` with bundled SQLite is implemented for native
services; see [decision 0003](decisions/0003-sqlite-import-foundations.md).
Choosing the OS application-data path belongs to the later native UI integration. Keep SQL and migrations in the backend;
do not store durable history in browser localStorage or inside game directories.
Bundle assets and required game metadata for local use, with explicit versions.

Logical entities (not a finalized schema):

| Entity | Information |
| --- | --- |
| Account | Internal key, game key, source account ID as text, server/region, display label |
| Roll | Internal key, account key, source roll ID as text when available, item ID/name, rarity, banner type, source ordering, timestamp and time-zone evidence |
| Import batch | Format/adapter version, source fingerprint, import time, counts, diagnostics without secrets |
| Provenance | Roll-to-batch association; enough evidence to explain merges and conflicts |
| Coverage | Known history boundaries, gaps, and source limitations per account/banner group |
| Game metadata | Versioned item/banner mappings and independently verified rule sets |

Keep game IDs such as `genshin-impact` and `honkai-star-rail` stable internally.
Use source IDs for identity, localized labels for display. Preserve timestamp
text and uncertainty; derive UTC only when the source provides sufficient context.

Deduplication uses adapter-defined stable identity scoped to game/account/server.
If source IDs are absent, design and test an explicit fallback; identical-looking
rolls can be legitimate. Ambiguous matches need reconciliation, not silent removal.

## Native boundary and durability

Expose specific commands for acquisition, cancellation, preview, commit, query,
export, and restore. Validate all parameters in Rust, including paths and
identifiers. A preview must identify
the validated bytes; do not blindly re-read a changed file on commit. Keep imports
atomic and enforce uniqueness in storage as well as in preflight validation.

Use schema versions and tested migrations. Backups need their own format version
and validation. Do not overwrite a database until a replacement has been validated;
define recovery behavior before implementing restore or destructive migrations.

Restrict webview capabilities and bundle UI resources. Files are data, never code.
Render imported names as text, and keep raw source payloads out of normal logs.

## Statistics

Pity and guarantee rules belong to each game adapter and may vary by banner and
rule version. Record evidence for rule mappings. Preserve banner identity even
when multiple banners share a pity group. Incomplete history must not be presented
as a known starting state; report observed counts or unknown values explicitly.

## Implemented HSR response adapter

`src-tauri/src/hsr.rs` is a standalone Rust library target; integration tests live
in `src-tauri/tests/hsr.rs` and run within the existing native coverage harness. It parses
bounded bytes into a page with optional server/timezone evidence and string roll
fields. It neither deduplicates nor persists. Mixed-account pages and invalid
records reject the entire page. Structured errors omit source messages and data.
SerDe/serde_json and chrono are pinned existing lockfile dependencies, now used
directly for decoding and calendar validation without device-clock access.

A page is not an import-ready account identity: the future service must resolve
missing server evidence and compare UID, server, timezone, and requested banner
across pages before merging. No complete-history claim follows from an empty
page. The shell does not invoke the adapter. SQLite service behavior is described below; see [research](HSR-API-RESEARCH.md) for the deliberately limited contract.

## Implemented SQLite import services

`src-tauri/src/storage.rs` accepts native database paths, HSR response byte slices,
and explicit UID/server context. The adapter validates every page before a read
transaction classifies scoped record identities. An immutable preview owns the
validated values and counts. The 16 MiB total batch limit supplements the parser's
2 MiB page limit. Empty datasets produce a no-records error, without creating an
account. No source is reread on commit and no service makes network requests.

Schema version 2 has accounts, unique rolls, compact import summaries and database
identity/revision metadata. Keys include game, UID, server and string record ID.
Roll JSON retains source fields/extensions; a scoped foreign key identifies its
first batch. Successful summaries retain adapter, import time and counts. Full
page snapshots and repeated associations are not retained. Identical reimports
add only a summary and revision update. Conflicts block the entire import,
including localized-label or timezone changes. Unknown timezone stays unknown;
resolving it requires explicit reconciliation rather than silent conversion.
See [decision 0004](decisions/0004-compact-import-provenance.md) for the deliberate
loss of exact historical input reconstruction and pre-release schema policy.

Commit acquires an immediate transaction, verifies database identity/revision,
rechecks timezone evidence and record classifications, then writes all state
atomically. Import time is a caller-supplied Unix timestamp in seconds. Other successful
imports invalidate outstanding previews, even for a different account. Cancellation
before commit is dropping a preview; UI cancellation during a transaction is not
implemented. A failed SQL insert or final commit rolls back the account, records,
first provenance, summary and revision. Queries are scoped to HSR/account/server and use
deterministic ID ordering, without treating that order as historical chronology.

Migration initializes only an empty unclaimed database and refuses unsupported
versions or unrelated content. The sole initial migration creates compact storage
directly. Pre-release schema changes may break compatibility: obsolete development
databases must be explicitly recreated and are rejected without modification.
The current header marker remains 2 to distinguish the old layout; no upgrade
chain is maintained. Database corruption yields safe
error categories; no repair/overwrite path is implemented. The shell still opens
no database and exposes no new Tauri capability. The next UI/acquisition increment
must resolve selected account/server and compare requested banner context.


## Initial acquisition contract

The [HSR API contract](HSR-API-CONTRACT.md) fixes the initial single-endpoint scope
and records accepted assumptions separately from observed evidence. Trust the auth
key to select the account for initial acquisition; preserve response UID, region
and offset for storage. Formal account/server verification is a closing requirement
of milestone 3. Existing scoped storage and conflict checks remain mandatory.

The future client defaults to 1000 records per page and sequential fetching,
balancing request count with smaller response batches.
Retries are limited to one per transiently failed request and two extra attempts
per acquisition. Authentication, validation and identity failures abort with an
actionable UI error. Complete retained history and manageable volume are accepted
assumptions; byte/request limits never justify silently incomplete commits.
