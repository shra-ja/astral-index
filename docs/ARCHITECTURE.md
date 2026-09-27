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
authentication failures must not corrupt existing history. HTTP library choice and credential retention remain implementation decisions.
Retry limits are settled in the [HSR API contract](HSR-API-CONTRACT.md#errors-and-completeness).

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

### Desktop extraction commands

`src-tauri/src/desktop.rs` registers `extract_automatically` and
`extract_from_file`, listed once in `src/desktop/commands.in` for both the library
and the `build.rs` app manifest. Declaring the manifest makes every app command
require a capability grant; `capabilities/main.json` grants only these two to the
main window for local content. Undeclared commands are refused.

The automatic command runs current-user extraction. The file command accepts
only a raw IPC body holding the bytes of a file the user chose through an HTML
file input; no path crosses IPC. Both return nothing on success or a safe
category: `unsupported_host`, `discovery_failed`, `no_game_data`, `no_cache`,
`no_request`, `file_too_large` or `invalid_file`. Contexts stay in a native
in-memory session, replaced by each extraction and emptied by a failed one.
They are never serialized, persisted or returned. The CSP's `connect-src` allows
only Tauri's local `ipc:` origins, so raw bodies use the custom-protocol IPC
instead of the JSON `postMessage` fallback; network origins stay blocked. The
file fallback does pass cache bytes through webview memory; see
[decision 0006](decisions/0006-desktop-extraction-commands.md).

In the webview, `src/commands.ts` wraps both commands through `@tauri-apps/api`,
maps unknown rejections to `unavailable`, and rejects files over 16 MiB before
reading them. `src/main.ts` shows the Star Rail extraction panel: automatic
search first, then the file chooser as the fallback after any automatic failure.
Both actions are disabled while either runs, so results cannot arrive out of
order. Success only confirms a request was found; nothing is fetched yet.

## Statistics

Pity and guarantee rules belong to each game adapter and may vary by banner and
rule version. Record evidence for rule mappings. Preserve banner identity even
when multiple banners share a pity group. Incomplete history must not be presented
as a known starting state; report observed counts or unknown values explicitly.

## Implemented HSR response adapter

`src-tauri/src/lib.rs` owns the shared native library, with sibling `hsr` and
`storage` modules. `src-tauri/src/hsr.rs` contains the HSR adapter; unit tests live beside it in a `cfg(test)` module and run within the existing native coverage harness. It parses
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
chain is maintained. Opening checks header compatibility and identity/revision
metadata; it is not a full schema or database integrity check. Missing tables or
altered constraints may fail only when used. History reads validate payload
syntax, unambiguous members, indexed UID/ID agreement and record invariants before
returning any records. Detected corruption yields safe error categories; no
repair/overwrite path is implemented. The shell still opens
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

## Extraction workflow

The user requests automatic discovery and extraction. Native code resolves the
current user's game location, locates the known `data_2` filename within supported
cache layouts, and extracts request context. If discovery fails, the user can
provide a file for local extraction. There is no discovered-cache chooser,
game-directory picker or source-selection session. These are the two intended
desktop actions. The native automatic-extraction service below is connected;
Tauri commands and desktop controls are not yet.

`discovery::system::extract_current_user_contexts` runs current-user log
discovery, then `discovery::extract_from_logs`. Game-data directories come from
the current log before the previous log, without repeats. Each directory's caches
are tried newest version first, then the legacy layout. The first cache that yields
any request context is returned whole; later caches are not read, and caches are
never merged, as each cache is assumed to hold one account's requests. Failures
report the furthest stage reached as a safe category: discovery failure, no game
data, no cache, or no usable request. Cache reads are synchronous within the
asynchronous service.

## Initial native cache extraction

`src-tauri/src/acquisition.rs` reads one supplied regular cache file
without writing to it or initiating network activity. Reads stop at 16 MiB plus
one overflow-detection byte; oversize inputs fail rather than yield partial
contexts. On Unix, the read-only open uses `O_NONBLOCK` before checking the opened
handle's type, so opening a FIFO cannot wait indefinitely for a writer. The flag
comes from pinned `libc`, already present transitively; regular-file reads are
unchanged. This is an initial application limit, not a verified maximum cache size.
The extractor tolerates binary data around NUL-terminated `1/0/` request entries.
It accepts the exact researched HTTPS endpoint spelling and five required query
fields, retaining their encoded bytes. Empty/malformed fields, duplicate required
fields, other game contexts, fragments and alternate endpoint spellings fail
candidate validation. Unrelated/unsupported entries are skipped; no valid candidate
produces a safe error. Distinct contexts are returned in reverse file order, each
at its last position, matching the researched method and the contract's
validation order. This order does not imply age, validity or current account.
Hash-set membership avoids scanning every prior context for each candidate.

Request contexts are opaque native values with redacted debug output and no
serialization implementation. Errors contain neither paths nor source text.
A discovered game-data directory can also be resolved through its immediate
`webCaches` directory: existing four-component numeric version paths are returned
in descending version order, followed by the legacy cache path. All candidates
remain available; version order does not establish credential age. The same
relative layouts work with native Windows paths and WSL-mounted Windows paths.
There is no desktop extraction command, file-upload fallback, HTTP transport or
credential persistence yet. The future client must use only the validated fields,
construct fresh pagination parameters and resolve account identity from responses.

## Windows player-log discovery

`src-tauri/src/discovery.rs` accepts an explicitly supplied host-native roaming
AppData location. It reads only sibling
`LocalLow/Cognosphere/Star Rail/Player.log` and `Player-prev.log`, preserving
each result independently. A missing or malformed current log cannot suppress
the previous log's candidates. The caller can also supply an individual log.

The shared read-only regular-file boundary retains the cache reader's nonblocking
Unix open and opened-handle validation. Log parsing is limited to the first
11 lines and 64 KiB, plus one overflow-detection byte. Later gameplay content,
including invalid text, is irrelevant; malformed UTF-8 within the header fails.
Exact startup markers yield distinct game-data directories in first-seen order.
Malformed recognized paths fail that log instead of returning a partial result.

Only drive-absolute Windows paths are accepted; UNC/device paths, traversal,
empty components and invalid Windows component characters are rejected.
WSL mapping requires an explicit absolute POSIX mount root and uses lowercase
drive names. It never assumes `/mnt`, probes drives, invokes a shell or scans
profiles. The returned paths remain native-only candidates for internal cache
resolution and reading, not user choices. Neither log discovery nor cache
extraction fetches history.

### Current-user system discovery

See [decision 0005](decisions/0005-current-user-windows-discovery.md) for the
OS lookup, helper and dependency choices.

`src-tauri/src/discovery/system.rs` adds the explicitly invoked asynchronous
`discover_current_user_logs` service. On Windows, pinned `dirs` resolves roaming
AppData through the Known Folder API. On Linux, a nonempty `WSL_DISTRO_NAME`
enables WSL discovery; other hosts fail with `UnsupportedHost`. This conservative
check avoids running Windows tools on ordinary Linux. Environments without that
marker can use the planned file-upload fallback through the existing cache reader.

WSL discovery runs a fixed, noninteractive, profile-free `powershell.exe`
expression to query Windows' `ApplicationData` folder with UTF-8 output.
It then uses `wslpath -a -u` for AppData and each game-directory candidate.
Each path is a separate argument, never PowerShell source. This respects the
active drive mappings without scanning profiles or assuming a shared username,
`/mnt`, or one common mount root. Both Windows and WSL folder results must be
valid Unicode drive-absolute Windows paths; UNC/device, relative and traversal
paths fail before game-log I/O. Translated paths must be absolute Linux paths.

Pinned Tokio supplies asynchronous pipes and deadlines. Each helper has a
five-second execution limit and a 32 KiB stdout limit plus one detection byte.
Stdin and stderr are discarded. Failed helpers are killed and reaped with a
separate five-second cleanup limit; cleanup failure does not mask the original
error. Dropping the discovery future uses Tokio's kill-on-drop behavior, whose
reaping is best-effort. These are per-helper deadlines, not a deadline for the
whole discovery operation or synchronous log-file I/O.

Log errors and translation failures remain separate for current and previous
logs. A failed log returns no partial candidate list and cannot suppress the
other log. Successful translated duplicates collapse in first-seen order.
Errors contain only safe categories; source paths and helper diagnostics stay
out of errors/logs. No game directories or caches are opened automatically by
this log-discovery service; the separate automatic-extraction service above
connects it to cache resolution and extraction. Explicit path inputs remain
internal service APIs.

Desktop extraction controls and real Windows/WSL installation validation remain pending.
These services add no Tauri command, permission, startup task or history request.

## Unit and boundary test separation

Backend unit tests execute the same service bodies against test-only replacements
for the filesystem and SQLite APIs. Compile-time imports select std/rusqlite in
normal builds and strict doubles in library unit tests; no mock or test-only API
is exposed in the desktop binary. The doubles verify boundary contracts rather
than simulate a full filesystem or SQL engine. Public integration tests continue
to validate real file behavior, persistence, constraints and rollback.

The test harness records backend coverage immediately after `cargo test --lib`,
before integration execution. Every backend source file defaults to the 100%
unit gate. Only the existing minimal `main.rs` and `build.rs` delegates use the
separate 100% native gate, with a source-body guard preventing unnoticed expansion.
No I/O/database functionality is exempted. See CONTRIBUTING for the mandatory policy.
