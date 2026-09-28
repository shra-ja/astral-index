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
file input; no path crosses IPC. Both then validate the extracted auth keys with
HoYoverse through `HttpTransport` and `validate`, in the same user action
([decision 0007](decisions/0007-validate-during-extraction.md)). The native
session holds only the validated context, in memory; it is emptied before each
extraction, so any failure leaves none, and every cached URL is dropped when the
command returns. Contexts are never serialized, persisted or returned. Both
commands return nothing on success or a safe failure, serialized as
`{"kind": ...}`: `unsupported_host`, `discovery_failed`, `no_game_data`,
`no_cache`, `no_request`, `file_too_large`, `invalid_file`, `expired_key`,
`rate_limited`, `network`, `rejected`, `invalid_response` or `internal`, or
`api_error` with the first nonzero API code as `code`. Nothing else, including
HTTP statuses and response text, crosses IPC. The CSP's `connect-src` allows
only Tauri's local `ipc:` origins, so raw bodies use the custom-protocol IPC
instead of the JSON `postMessage` fallback; network origins stay blocked. The
file fallback does pass cache bytes through webview memory; see
[decision 0006](decisions/0006-desktop-extraction-commands.md).

In the webview, `src/commands.ts` wraps both commands through `@tauri-apps/api`,
maps any rejection that is not exactly a native failure shape to `unavailable`,
and rejects files over 16 MiB before reading them. `src/main.ts` shows the Star
Rail retrieval panel, which says the app checks the saved link with HoYoverse
and needs a connection: "Start retrieval" first, with the file chooser always
available below it as the fallback. Both actions are disabled while either runs,
so results cannot arrive out of order. Validation failures read the same for
both actions. Success confirms HoYoverse accepted a key; no history is fetched yet.

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
are tried latest version first, then the previous version. The first cache that yields
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
Each context comes back as a `CachedRequest` with its cached URL: the exact
endpoint-checked text up to the entry's NUL, taken from the context's last
occurrence, for validation to send unchanged
([decision 0007](decisions/0007-validate-during-extraction.md)).
`CachedRequest::into_context` drops the URL. The desktop commands pass cached
requests straight to validation, so no cached URL outlives an extraction command.

Request contexts and cached requests are opaque native values with redacted
debug output and no serialization implementation. Errors contain neither paths nor source text.
A discovered game-data directory can also be resolved through its immediate
`webCaches` directory. Only the two newest four-component numeric version folders
are considered, latest first, because the user reports auth keys last about 24
hours: a previous-version key can only be valid just after a game update. Version
folders count even without a cache, so a missing latest cache cannot bring an
older version into the window, and a file with a version-like name is not a
folder. The unversioned `webCaches/Cache` layout is not supported; installations
are assumed to use version folders. Version order does not establish credential
age within the window. The same
relative layouts work with native Windows paths and WSL-mounted Windows paths.
Desktop extraction commands and controls exist and validate keys (see above);
there is no credential persistence. The pagination client must use only the validated fields,
construct fresh pagination parameters and resolve account identity from responses.

`src-tauri/src/acquisition/request.rs` builds those page requests.
`RequestContext::page_request` appends `gacha_type`, `page`, `size=1000` and
`end_id` to the endpoint and the five cached fields, which keep their encoded
bytes and cached order; cached paging values never carry over. `Category::ALL`
lists the six known categories in contract order and is also the parser's list
of valid `gacha_type` codes. The page number cannot be zero, and the cursor is
either the start (`end_id=0`) or a previous record, whose ID is percent-encoded
so an unexpected value cannot escape the query. `PageRequest` keeps the requested
size for the short-page rule and redacts its credential-bearing URL in debug
output. Building a request makes no network call.

`src-tauri/src/acquisition/transport.rs` defines the `Transport` trait, one async
`get` returning the response body or a safe `TransportError`, so validation and
pagination can be tested against scripted transports. `HttpTransport` implements
it with `reqwest` and rustls using `ring` and the OS trust store. It refuses any
URL other than the exact endpoint before sending, never follows redirects,
treats any status other than 200 as an error, uses no system proxy, applies
10-second connect and 30-second request timeouts, and stops reading once a body
exceeds 2 MiB. The extraction commands use it for validation. See
[decision 0008](decisions/0008-https-transport.md).

`src-tauri/src/acquisition/outcome.rs` classifies one attempt, a transport result,
into a parsed page or a `FetchFailure`. HTTP success is not API success: a 200
body with `retcode -101` is an expired key, and any other nonzero code is an API
error that keeps its number for display. HTTP 429 means rate limited. The
API-level rate-limit code is unknown and is not guessed. Timeouts, connection
failures and HTTP 5xx are transient, the only retryable category. Other statuses,
including redirects, are rejected. Malformed, oversized or inconsistent responses
are invalid, and an unsupported URL or missing client is internal: nothing was
sent. The parser mapping lists every `ParseError` variant, so a new one must be
classified explicitly.

`src-tauri/src/acquisition/validation.rs` validates auth keys
([decision 0007](decisions/0007-validate-during-extraction.md)). `validate` takes
the extracted cached requests, in reverse file order, and sends at most five
cached URLs unchanged through a `Transport` and the classifier. It returns the
first context whose response is a valid page, discarding that page's records.
An expired key or other API code moves on to the next context. Any other
failure stops at once. If every key is rejected, it reports an expired key if
any expired, otherwise the first code. It consumes the cached requests, so every
URL is dropped when it returns. With no contexts it sends nothing and reports an
internal failure. `CachedRequest::url` is crate-private, so only native
acquisition code can read a cached URL. Both extraction commands call it through
the retrying transport described below.

`src-tauri/src/acquisition/pagination.rs` retrieves history from a validated
context. `fetch_history` requests the six categories in `Category::ALL` order,
each from page 1 with `end_id=0`. A page with fewer than 1000 records, including
none, ends its category. A full page advances the page number and sets the
cursor to its last record's ID; a cursor already seen in that category is a
cycle, and a page with more records than requested is invalid. Response sizes
are summed as they arrive, and retrieval stops once the total passes the 16 MiB
batch bound (`MAX_BATCH_BYTES`, shared with storage), before any further
request. Any fetch failure also stops it. The result is a `History` of raw
response bodies in request order, with redacted debug output, in the form
`Store::preview` takes; storage re-parses and validates them. The classifier is
split into `transport_failure` and `parse_body`, so pagination keeps each body
without copying it. No command calls `fetch_history` yet.

Both `fetch_history` and `Retrying` take a `Report`, a `&(dyn Fn(Progress) +
Sync)` that must return quickly. Before each page request, `fetch_history`
reports `Progress::Requesting` with the category, page number, and the pages and
records received so far across all categories. Before each retry delay,
`Retrying` reports `Progress::RetryPending` with the delay, so validation retries
are reported too. Events carry categories and counts only, never IDs, URLs or
response text. The extraction commands pass a no-op reporter for now; the
acquisition commands will forward events to the webview.

`src-tauri/src/acquisition/retry.rs` applies the retry budget. `Retrying` wraps
any `Transport`: a transient failure (timeout, connection failure or HTTP 5xx)
is retried once for the same URL after `RETRY_DELAY` (one second), if the shared
`RetryBudget` still has one of its `MAX_RETRIES` (two) extra attempts. A failed
retry is returned, not retried again, and every other outcome is returned at
once without spending the budget. `validate` and `fetch_history` take the
wrapped transport unchanged. The extraction commands create a budget per
extraction and validate through it; the future acquisition command must carry
that same budget into pagination, since the budget covers the whole acquisition.

`src-tauri/src/acquisition/cancel.rs` applies user cancellation. `Cancellable`
wraps a transport with a `CancellationToken` from exactly pinned `tokio-util`
0.7.19, without default features; it was already resolved through existing
dependencies, so no new crate was added. Once the token is cancelled, a request
in flight is dropped, and every later request returns
`TransportError::Cancelled` without being sent. That becomes
`FetchFailure::Cancelled`, which is not retried and stops `validate` and
`fetch_history`, so no context or history is returned. Wrap it outside
`Retrying`, so cancelling also interrupts a retry delay. Retrieval never writes
storage; only an explicit commit does. No command creates or cancels a token
yet: the cancel command and its control arrive with the acquisition commands,
and the native `cancelled` failure kind has no webview message until then.

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

These services add no Tauri command, permission, startup task or history request;
the desktop commands above compose them with validation.

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
