# Architecture

The shell uses Vue 3 with TypeScript 6, Vite/npm and Tauri 2; see decisions 0001
and 0011.
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

`src-tauri/src/desktop.rs` registers `extract_automatically`,
`extract_from_file`, `cancel_acquisition`, `retrieve_history`, `commit_import`
and `discard_import`, listed once in
`src/desktop/commands.in` for both the library and the `build.rs` app manifest.
Declaring the manifest makes every app command require a capability grant;
`capabilities/main.json` grants only these six to the main window for local
content. Undeclared commands are refused.

The session holds the current acquisition in memory: the validated context, the
retry budget validation started (for retrieval to continue with) and a
cancellation token for the running operation. Starting an operation cancels
any earlier one, and a validated context is kept only if its operation was not
cancelled, checked under the session lock. `cancel_acquisition` cancels the
running operation and drops the context and any held preview.

`retrieve_history` takes the validated context and its budget out of the session,
so the session holds no auth key from then on, and fails with `no_context` if
there is none. It retrieves every category through
`Cancellable(Paced(Retrying(...)))`, as validation does,
continuing the extraction's budget, and streams `ProgressEvent`s (`requesting`
with the category code, page and totals, or `retry_pending` with the delay) over a
Tauri channel. The context is dropped as soon as retrieval ends, whatever the
outcome. A retrieval failure carries the failing request's `gacha_type` and `page`
beside its kind. With no records the command returns `{"kind":"no_history"}`
without opening the database. Otherwise it previews the history under the
resolved account through `Database::run`, keeps the preview in the session unless
the operation was cancelled meanwhile, and returns the review as
`{"kind":"review", ...}`. New failure kinds are `no_context`,
`history_too_large`, `mixed_accounts`, `missing_server`, `storage`,
`context_mismatch`, `conflict` and `stale_preview`; the last two are for commit.
`commit_import` takes the held preview and commits it through `Database::run`
with the current Unix time, returning the summary of rolls added, duplicates and
conflicts. The preview is used up whatever the outcome: a conflict or
`stale_preview` means retrieving again. A commit is atomic and quick, so it is
not cancellable. `discard_import` drops the held preview without writing;
without one, commit fails with `no_preview` and discard does nothing.
Unit tests replace Tokio's `spawn_blocking` with an inline double, so the scripted
SQL double is visible; the database integration test covers the real thread hop.

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

In the webview, `src-ui/src/commands.ts` wraps the commands through `@tauri-apps/api`,
maps any rejection that is not exactly a native failure shape to `unavailable`,
keeps a failure's category and page only when both are valid, streams retrieval
progress through a `Channel`,
and rejects files over 16 MiB before reading them. Star Rail's Import screen
shows one step at a time ([decision 0013](decisions/0013-visual-design.md)). The
sources offer "Retrieve history" and "Choose cache file…", say the app contacts
HoYoverse only when asked, and show file import as coming soon; Genshin Impact's
are disabled. While retrieval runs, a progress screen marks its steps (finding
and checking the link are one native step, so they are marked together), names
the warp, page and rolls so far, and gives Cancel focus. Once Cancel is pressed,
progress no longer shows, and a success that races the cancel keeps nothing. A
retrieved preview is then reviewed: its heading takes focus, and it shows the
account, a summary of new, skipped (already saved) and conflicting rolls, the server-time
period and a table per warp, with Save and Discard (or Done when nothing is new)
in a fixed footer. Conflicts are listed by warp, time and ID with Save disabled,
since the native commit refuses them. The review also counts the new 5★ and 4★
rows (per row, not per item, among the rolls being added only); a save opens a
Saved screen with those counts, the existing rolls skipped and a link to the history; a failure opens a Failed screen headed by its kind, with Try again
for a device search, "Choose cache file…" and Back. Cancelling, discarding and
up-to-date or empty retrievals return to the sources with a note, and focus
returns to the control that started retrieval.

The webview is a Vue app ([decision 0011](decisions/0011-vue-frontend.md)) in three
layers, so screens can be rearranged without rewriting the flow:

- **Shell and routes:** `src-ui/src/main.ts` mounts `App.vue`, which places the
  `AppSidebar` beside a `RouterView` ([decision 0013](decisions/0013-visual-design.md)).
  `src-ui/src/router/index.ts` uses hash history with a History and an Import
  route per game (`/:game/history`, `/:game/import`); the app opens on Star
  Rail's history and any other address returns there. The shell creates the
  retrieval flow and provides it to the screens, so a running retrieval and its
  review survive switching screens.
- **Flow:** `composables/useRetrieval.ts` owns the retrieval flow and makes its
  native calls; `composables/useHistory.ts` is the only other caller, reading
  saved history for the History screen. It exposes read-only state (the phase —
  idle, acquiring, reviewing, saving or leaving — how the link was found, the
  stage while acquiring, the status text, the review, how the last retrieval
  ended and whether a cancel is pending) and actions (search the device, read a
  file, cancel, save, discard, done, dismiss). The outcome is a save with its
  account, a failure with a title and message, or a note (cancelled, discarded,
  up to date, no history). `src-ui/src/messages.ts` turns failures, progress and
  save results into text and failure kinds into titles.
- **Saved history:** `useHistory` holds the category, page and rows per page
  (20, 50 or 100) and the page read for them. It opens on Character Event Warp,
  or on the first category in tab order with rolls when that has none. Choosing
  a category returns to its first page, and changing rows per page keeps the
  first shown row in view. Only the latest read updates the screen, so a slow
  earlier read never replaces a later one. It reads this device only, never
  HoYoverse.
- **Views and components:** `views/HistoryView.vue` shows the account the latest
  import went into and a page of its saved rolls (Star Rail only; an empty state
  until something is saved, and for Genshin Impact) and `views/ImportView.vue`
  wires the retrieval flow to presentational components, which take props and
  emit events. They are grouped under `components/` by where they are used
  (`layout/`, `history/`, `import/` and `shared/`): `AppSidebar` (game and
  screen links, marking the current ones, collapsing to icons below a 900px app
  width), `ScreenHeader`, `EmptyState`,
  `ImportSources` (emits `search` or `choose` with the file, and exposes `focus`
  for the control that started retrieval), `CachePicker` (a button-styled label
  over a visually hidden file input), `RetrievalProgress` (emits `cancel`),
  `ReviewPanel` (emits `save`, `discard` and `done`), `ImportSaved` (emits
  `done`, with the caller's history link) and `ImportFailed` (emits `retry`,
  `choose` and `back`). The History screen adds `AccountChip` (UID and server,
  text until accounts can be switched), `CategoryTabs` (tabs with counts that
  drop their counts, then become a "Banner category" dropdown, when hidden
  copies measured against the available width show they no longer fit; emits
  `select`), `RollList` (#, item with an initials placeholder, rarity, type and
  server time with the offset in its header; Type, then Time, drop out as the
  list narrows, through container queries), `RollPager` (the shown range, page
  numbers around the current page with the first and last, and rows per page;
  emits `go` and `resize`) and `HistoryFailed` (emits `retry`). Progress focuses Cancel and the review, saved and failed
  screens focus their headings as they mount; the Import view refocuses the
  starting control when the sources return. Warp, game, history and tab names,
  server dates and times, UTC offsets and item initials come from
  `src-ui/src/format.ts`.

`history_page` reads stored history without any network access: for the account
the latest import went into, one page of a category's rolls, newest first by
server time then numeric roll ID, each numbered by its position in the category
(1 is the oldest stored), with the account's count in each of the six categories
(zeros included) so the History screen can label every tab from one read. It
checks the category, the page (from 1) and the page size (1 to 100) before
opening the database and returns `invalid_request` otherwise; with no import yet
it returns no account, no rolls and zero counts. Storage counts rows in one
grouped query and orders them with `json_extract` on the stored payloads; a
count for an unknown category, like a row that fails validation, is reported as
damaged storage rather than shown.

Commands take their transport from a managed `Network`: HTTPS to HoYoverse in the
app, or the synthetic HoYoverse of the mock debug binary
([decision 0014](decisions/0014-mock-debug-binary.md)). `acquisition::mock`
generates pages from each request's category, cursor and size for a scenario
chosen by `ROLL_TRACKER_MOCK_SCENARIO`, sending nothing; the mock binary keeps its
history in its own `roll-tracker-mock` folder and never uses portable mode.

Base styles and the decision 0013 colour tokens live in
`src-ui/src/assets/main.css`; each component carries its own scoped styles. A
base rule keeps elements with the `hidden` attribute hidden whatever display a
style sets. Everything is bundled, so the production CSP needs no inline
styles or scripts.

## Statistics

Pity and guarantee rules belong to each game adapter and may vary by banner and
rule version. Record evidence for rule mappings. Preserve banner identity even
when multiple banners share a pity group.

Pity is calculated as though each pity group's stored rolls were complete: the
oldest stored roll starts the count. Otherwise the first rolls of an account would
never show pity, even when its history is known to be complete. Importing older
rolls changes the pity of every later roll in that group. Guarantees and 50/50
outcomes need verified banner metadata; until it exists the UI reports them as
unavailable rather than guessing.

Pity is derived when history is read, not stored. One ordered pass over a pity
group's rolls (by time, then source ID, with the order verified per game) costs
O(n); even tens of thousands of rolls take well under a millisecond in Rust.
A page of history still needs that pass, because each roll's pity depends on the
rolls before it, not only on the rows shown. Storing pity would make every import
of older rolls rewrite all later rows in the same transaction, and every change to
pity-group or rule mappings a data migration. Add a cache only if measured reads
of large histories need one, and treat it as disposable derived data.

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

Classification records each incoming record's status (new, duplicate or
conflict); summaries, commit inserts and the review all derive from it. Each
preview carries a serializable `Review`, the native review DTO: UID, server,
timezone offset, overall counts, counts for all six categories in fetch order
(including empty ones), the earliest and latest server-local record times, and
each conflict's ID, category and time. It carries no payloads. Validated times
share one canonical format and offset, so text order is time order. `Category`
now lives in `hsr.rs`, re-exported from `acquisition`, so storage takes the
category order without depending on acquisition. Individual records are not in
the review yet; a record list, such as highlighted 5-star rolls, can be added
as a field later.

The desktop layer keeps the database at `history.sqlite` in the app's folder in
the local data folder (`%LOCALAPPDATA%\Roll-Tracker` on Windows, never the roaming
profile; `roll-tracker` in the XDG data folder on Linux, including WSL), resolved
at setup but created and opened only on first use. A `data` folder beside the
executable switches on portable mode, and the database then lives there instead;
`database::location` chooses, and a portable database is used even if the local
folder also has one ([decision 0010](decisions/0010-portable-mode.md)). The setup
hook also opens the main window, pointing the webview's profile into the same
folder (`webview` on Linux; WebView2 adds `EBWebView` itself on Windows).
`desktop::Database::run` runs SQLite work on Tokio's blocking pool, reusing the
open store; failures are the safe storage `Database` error. See
[decision 0009](decisions/0009-local-database-location.md).

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

The [HSR API contract](HSR-API-CONTRACT.md) fixes the initial two-endpoint scope
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
It accepts the exact researched HTTPS spelling of either history endpoint,
`getGachaLog` or the collaboration warps' `getLdGachaLog`, and five required query
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
`end_id` to the category's endpoint (`getLdGachaLog` for the two collaboration
warps, `getGachaLog` otherwise) and the five cached fields, which keep their encoded
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
URL other than the two exact endpoints before sending, never follows redirects,
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
each from page 1 with `end_id=0`, requesting 1000 records. Only an empty page
ends a category: `getLdGachaLog` caps pages at 20, and the echoed `data.size` is
unreliable (`getGachaLog` echoes `"0"`), so a short page is not taken as the last.
Any other page advances the page number and sets the cursor to its last record's
ID; a cursor already seen in that category is a cycle, and a page with more
records than requested is invalid. Response sizes
are summed as they arrive, and retrieval stops once the total passes the 16 MiB
batch bound (`MAX_BATCH_BYTES`, shared with storage), before any further
request. Any fetch failure also stops it. The result is a `History` of raw
response bodies in request order, with redacted debug output, in the form
`Store::preview` takes; storage re-parses and validates them. The classifier is
split into `transport_failure` and `parse_body`, so pagination keeps each body
without copying it. No command calls `fetch_history` yet.

`fetch_history` also resolves the account the history belongs to, per the
[contract](HSR-API-CONTRACT.md#account-server-and-timestamps). The UID comes
from records (the parser already requires one UID per page) and the server from
each page's `region`; a page without a region, or without records, adds no
evidence, but every value present must match the first, or retrieval stops at
once with `MixedAccounts` or `MixedServers`. `History::account()` returns an
`Account` (UID and server, with redacted debug output) to preview under. With no
records it returns `None`: no history was found, which is not an error, and no
account is created. Records with no named server anywhere fail with
`MissingServer`; nothing is fabricated. Storage preview still checks every page
against the account, server and timezone independently.

Both `fetch_history` and `Retrying` take a `Report`, a `&(dyn Fn(Progress) +
Sync)` that must return quickly. Before each page request, `fetch_history`
reports `Progress::Requesting` with the category, page number, and the pages and
records received so far across all categories. Before each retry delay,
`Retrying` reports `Progress::RetryPending` with the delay, so validation retries
are reported too. Events carry categories and counts only, never IDs, URLs or
response text. The extraction commands pass a no-op reporter;
`retrieve_history` forwards events to the webview, which shows them.

`src-tauri/src/acquisition/retry.rs` applies the retry budget. `Retrying` wraps
any `Transport`: a transient failure (timeout, connection failure or HTTP 5xx)
is retried once for the same URL after `RETRY_DELAY` (one second), if the shared
`RetryBudget` still has one of its `MAX_RETRIES` (two) extra attempts. A failed
retry is returned, not retried again, and every other outcome is returned at
once without spending the budget. `validate` and `fetch_history` take the
wrapped transport unchanged. The extraction commands create a budget per
extraction and validate through it; the future acquisition command must carry
that same budget into pagination, since the budget covers the whole acquisition.

`src-tauri/src/acquisition/pace.rs` paces requests: `Paced` waits
`REQUEST_INTERVAL` (500 ms) before every request of the transport it wraps. It sits
outside `Retrying`, so a retry keeps its own one-second delay, and inside
`Cancellable`, so cancelling interrupts the pause. The classifier treats
`retcode -110`, observed once from unpaced page requests, as `RateLimited`,
which stops validation and retrieval like HTTP 429.

`src-tauri/src/acquisition/cancel.rs` applies user cancellation. `Cancellable`
wraps a transport with a `CancellationToken` from exactly pinned `tokio-util`
0.7.19, without default features; it was already resolved through existing
dependencies, so no new crate was added. Once the token is cancelled, a request
in flight is dropped, and every later request returns
`TransportError::Cancelled` without being sent. That becomes
`FetchFailure::Cancelled`, which is not retried and stops `validate` and
`fetch_history`, so no context or history is returned. Wrap it outside
`Retrying`, so cancelling also interrupts a retry delay. Retrieval never writes
storage; only an explicit commit does. Each acquisition command starts with a
new token, which `cancel_acquisition`, called by the panel's Cancel button, cancels.

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
unit gate. Only the minimal `main.rs`, mock binary and `build.rs` delegates use the
separate 100% native gate, with a source-body guard preventing unnoticed expansion.
No I/O/database functionality is exempted. See CONTRIBUTING for the mandatory policy.
