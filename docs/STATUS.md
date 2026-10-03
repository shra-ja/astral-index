# Project status

Updated: 2026-10-03

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. The shell does not yet acquire, import or display history.

## Milestone 2 review remediation

Integrated through PR #3 (`20428aa`). Parser fixes preserve precise JSON
numbers, reject duplicate members and enforce the exact timestamp shape. History
reads verify stored identity and domain invariants. A shared library root separates
HSR and storage modules. Test discovery now covers additional frontend/tooling
suites; native CSP verification checks a policy violation and has a permissive-policy
mutation probe. The shell copy reflects the acquisition-first roadmap.

`npm run check` passed: 46 Rust tests, 17 frontend/tooling tests, native offline
integration, five failure/discovery probes, source/report validation, TypeScript,
formatting and Clippy. All required coverage metrics are 100% per source file.
The regression tests reproduced the four data issues before fixes; the new-suite
probe confirmed the old command omitted tests. See [testing](TESTING.md) for
red/green and mutation evidence. `npm run tauri -- build --no-bundle` also passed for Linux.
Review fixes are integrated on `main`.
The existing branch history is preserved; subsequent service work should use
smaller reviewed increments and the same-day integration target in CONTRIBUTING.

## Milestone 3 — selected cache foundations

Work is on `feat/hsr-request-extraction`, branched from current `main` after
fetch/fast-forward verification. Windows is the initial game-installation target;
discovery must work from Windows and WSL. Ubuntu/WSL remains the current test
host, not a native HSR installation target.

The native acquisition module now reads bounded selected cache files without
modifying them, extracts the five encoded request-context fields from the
researched cache framing, validates the exact endpoint, deduplicates contexts,
and redacts credentials from debug output. The selected game-data resolver checks
legacy and versioned `webCaches` layouts, returning existing version paths in
numeric descending order. It does not treat cache position/version as key age
or silently select an account. No network calls or new Tauri capabilities exist.

TDD: the initial three tests failed on valid extraction, the byte limit and file
reading before implementation; the directory-layout test then failed before its
resolver was implemented. The initial six focused tests covered these behaviors and safe
I/O failures. Before the unit-first refinement below, `npm run check` passed: 52 Rust tests,
17 frontend/tooling tests, native offline integration, all five enforcement
probes, source/report checks, formatting, TypeScript and Clippy. All required
coverage metrics are 100% per first-party source file, with no new exclusions.
`npm run tauri -- build --no-bundle` passed after the probes restored the normal
CSP, producing the Linux development-host executable. Native Windows build and
installation verification remain pending.

## Unit-first backend coverage

Unit tests now sit beside acquisition, parser and storage code and use filesystem
and SQLite API doubles. Public integration tests under `src-tauri/tests/` retain
real I/O, persistence, constraint and rollback verification. No production API was
widened for testing. There are 39 backend unit tests and 27 integration tests.

An isolated unit-only report is captured before integration/native execution;
every backend file requires 100% lines, regions, functions and branches from that
report alone. Only the minimal Tauri startup/build delegates retain a separate
100% native gate. A source-body guard rejects changes to those exceptions, and
CONTRIBUTING/AGENTS document the user-approved scope explicitly. New backend
files, including database/I/O code, default to unit-only coverage.

`npm run check` passed on the final refactor: 39 Rust unit tests, 27 real-boundary
integration tests, 17 frontend/tooling tests, native offline integration, eight
enforcement probes, both report/exception guards, TypeScript/build, formatting
and Clippy. Every backend source file reached 100% unit-only coverage, and both
startup/build wrappers reached 100% in their separate gate. The new report
requirement first failed when only the old combined report existed. The probes
confirmed that integration-only execution cannot fill a unit gap and that missing
unit reports or changed wrapper bodies fail. Only supporting test-double files
are newly excluded from the production source inventory; no production logic is
excluded. `npm run tauri -- build --no-bundle` also passed for the Linux
development host after all probes restored the normal source/CSP. Windows native
validation remains pending. This work is recorded on
`feat/hsr-request-extraction`; nothing has been pushed or published.

## Cache extraction review fixes

Review follow-up remains on `feat/hsr-request-extraction`. Unix cache opens now use
`O_NONBLOCK` and validate the opened handle before reading, rejecting FIFOs without
waiting for a writer. Context deduplication uses a hash set while retaining
first-seen order. Pinned `libc` supplies the platform flag without adding a new
resolved dependency version.

Both regression tests failed before implementation: a FIFO exceeded the
three-second deadline and an 80,000-context cache exceeded ten seconds. Both now
pass; the large cache completed in about 0.43 seconds in the focused debug run.
All 39 backend unit tests and four acquisition integration tests passed in that
run. `npm run check` then passed: 39 backend unit tests, 29 integration tests,
17 frontend/tooling tests, native offline integration, eight enforcement probes,
both coverage-report guards, TypeScript/build, formatting and Clippy. All required
per-file coverage metrics remain 100%, including the isolated backend unit gate.
`npm run tauri -- build --no-bundle` also passed for the Linux development host.
Native Windows verification remains pending.

## Player-log discovery increment

Work continues on `feat/hsr-request-extraction` after the cache review fixes.
The user-provided PowerShell reference obtains roaming `ApplicationData`, then
uses sibling `LocalLow/Cognosphere/Star Rail`. The new native discovery service
follows that rule from an explicitly supplied host-native AppData location.
It returns independent results for `Player.log` and `Player-prev.log`, reading
only their first 11 lines within a 64 KiB header bound. Explicit Windows-drive
mapping supports caller-supplied WSL mount roots. No profile scans, shell execution,
source writes, credential exposure or network requests were added.

Six new behavior tests failed against stubs before implementation, then passed.
Seven discovery unit tests now cover mocked file access, independent log outcomes,
header bounds, Unicode/spaces, path validation and explicit drive mapping.
Two real-file integration tests verify unchanged source bytes and a synthetic
mounted Windows layout from log candidate through cache extraction.

Verification: `npm run check` passed: 46 backend unit tests, 31 integration
tests, 17 frontend/tooling tests, native offline execution, eight enforcement
probes, both report guards, TypeScript/build, formatting and Clippy. All required
per-file metrics are 100%, including isolated backend unit lines, regions,
functions and branches. A final integration assertion accommodates rejection of
directories either during open or opened-type validation; focused integration
tests, Clippy, formatting and report validation passed again afterward.
`npm run tauri -- build --no-bundle` passed for the Linux development host.
Native Windows and real installed-game verification remain pending.
No private source is included in this increment; the reference script was not executed.

## Current-user system discovery increment

Work continues on `feat/hsr-request-extraction`; fetched `origin/main` remains
`20428aa`. The asynchronous native discovery service now resolves Windows'
roaming AppData through the Known Folder API. On WSL-marked Linux it runs a fixed
PowerShell folder query and uses `wslpath` for AppData and each game-directory
candidate. It does not guess usernames/mount roots or scan other profiles.
Both paths validate folder results before game-log I/O. Explicit source APIs
remain available; no startup hook, Tauri command or history request was added.

Helper execution is limited to five seconds and 32 KiB stdout, with discarded
stdin/stderr. Error cleanup explicitly kills/reaps the helper within a separate
five-second bound; cancellation uses kill-on-drop. Current and previous log
outcomes remain independent. See
[decision 0005](decisions/0005-current-user-windows-discovery.md) for the pinned
dependencies, alternatives and platform limitations.

TDD: four initial tests failed against stubs before implementation. A real-process
regression exposed unreliable prompt reaping on oversized output with drop-only
cleanup; explicit bounded cleanup made it pass. Two native folder-validation
tests then failed before rejecting unsupported paths ahead of game-log access.
Ten new system-discovery unit tests mock OS/folder/process/file APIs and use a
paused clock. Two Linux integration tests use synthetic executables and files;
they never invoke real Windows tools or access private profiles/logs.

`npm run check` passed on the final code: 56 backend unit tests, 33 integration
tests, 17 frontend/tooling tests, native offline execution, eight enforcement
probes, both report guards, TypeScript/build, formatting and Clippy. All required
per-file metrics remain 100%, including the isolated backend unit gate. No
coverage exception or exclusion was added.
`npm run tauri -- build --no-bundle` also passed for the Linux development host.
Native Windows/actual WSL interop and real-installation verification remain pending.

## Extraction workflow correction (2026-09-27)

The user requests automatic discovery and extraction; the application locates
`data_2` internally. A user-provided file is the fallback when discovery fails.
There is no discovered-cache chooser or game-directory picker. The incorrect
uncommitted source-selection session and its tests have been removed; the
existing discovery and extraction helpers remain unchanged.

Verification after removal: `npm run check` passed with 56 backend unit tests,
33 integration tests, 17 frontend/tooling tests, all enforcement probes and
100% required coverage. `npm run tauri -- build --no-bundle` passed on Linux.
The final diff is documentation-only; no new behavior or TDD cycle was introduced.
Native Windows/real WSL installation verification remains pending.

## Automatic extraction service (2026-09-27)

Work is on `feat/automatic-extraction`, branched from `main` at `1a7a74d` (PR #6).
`discovery::system::extract_current_user_contexts` now composes current-user log
discovery, `webCaches` resolution and cache extraction. Directories from the
current log are tried before the previous log; caches newest version first, then
legacy. The first cache yielding a context is returned whole and caches are never
merged. Failures report discovery failure, no game data, no cache or no usable
request. The extractor now returns contexts in reverse file order, each at its
last position, as the contract's auth-key validation requires. No Tauri command,
permission, network request or credential persistence was added.

TDD: the reverse-order unit test failed on first-seen output before the change.
Three composition tests and one entry-point test failed against stubs, then passed.
The in-memory filesystem double gained repeatable per-directory listings. The
large-cache integration test's position checks were updated for reverse order.

`npm run check` passed: 60 backend unit tests, 33 integration tests, 17
frontend/tooling tests, native offline execution, eight enforcement probes, both
report guards, TypeScript/build, formatting and Clippy. All required per-file
metrics remain 100%, including the isolated backend unit gate, with no new
exclusions. `npm run tauri -- build --no-bundle` passed for the Linux host.
Real Windows/WSL installation verification remains pending.

## Desktop extraction commands (2026-09-27)

Work is on `feat/extraction-commands`, branched from `main` at `5ce4401` (PR #7).
`src-tauri/src/desktop.rs` registers `extract_automatically` and
`extract_from_file`. Both return nothing or a safe failure category. Extracted
contexts stay in an in-memory native session, replaced by each extraction and
emptied by a failed one. The file command takes the selected file's bytes as a
raw IPC body; no path crosses IPC. See
[decision 0006](decisions/0006-desktop-extraction-commands.md).

The user reviewed the wrapper exceptions: `main.rs` now delegates through
unit-tested `desktop::register`, and `build.rs` declares an app manifest from
the shared `src/desktop/commands.in`. `capabilities/main.json` grants only the
two commands to the main window. The source-body guard pins both new bodies.
The native test showed that `connect-src 'none'` forced Tauri's JSON
`postMessage` fallback, so both CSPs now allow only `ipc: http://ipc.localhost`.
Network origins remain blocked, and the mutation probe was updated.

TDD: four desktop tests failed against stubs, then passed. The updated wrapper
guard failed before the wrappers changed. A new native assertion calls a granted
command and an undeclared one from the real webview; it first failed on the CSP
fallback (`invalid_file`), then passed. The unit gate then found macro-generated
missing-state paths uncovered; a failing missing-session test preceded splitting
handler registration from state management.

`npm run check` passed: 65 backend unit tests, 33 integration tests, 17
frontend/tooling tests, native offline execution with the IPC assertions, eight
enforcement probes, both report guards, TypeScript/build, formatting and Clippy.
All required per-file metrics are 100%, including the isolated backend unit gate,
with no new exclusions. `npm run tauri -- build --no-bundle` passed on Linux.
Real Windows/WSL verification remains pending.

## HSR extraction controls (2026-09-27)

Work is on `feat/extraction-controls`, branched from `main` at `4ff6d69` (PR #8).
Selecting Honkai: Star Rail shows an extraction panel: "Find automatically"
first, then a `data_2` file chooser as the fallback after any automatic failure.
Each failure category has its own message saying what to try next; unexpected
rejections show a generic retry message. Both actions are disabled and the panel
is marked busy while either runs. Success only confirms a request was found.
`src/commands.ts` is the typed client, through exactly pinned `@tauri-apps/api`
2.11.1 (recorded in decision 0006). It rejects files over 16 MiB before reading
them and maps unknown rejections to `unavailable`.

TDD: five client tests and five UI tests failed against stubs or the old UI,
then passed. The native test now presses the button with the keyboard in the
real app, checks the unsupported-host message and the revealed fallback, then
uploads a synthetic cache through the real file input and checks the success
message. The app is started with an empty `WSL_DISTRO_NAME`, so it never launches
Windows helpers from a WSL test host.

`npm run check` passed: 65 backend unit tests, 33 integration tests, 27
frontend/tooling tests, native offline execution with the new UI flow, eight
enforcement probes, both report guards, TypeScript/build, formatting and Clippy.
All required per-file metrics are 100%, with no new exclusions.
`npm run tauri -- build --no-bundle` passed on Linux. Real Windows/WSL
verification remains pending.

## Cache version window (2026-09-27)

Work is on `fix/cache-version-window`, branched from `main` at `09f2ba3` (PR #9).
In the user's WSL run, renaming the latest version's `data_2` still produced a
success, from an older version's cache. The user reports auth keys last about 24
hours, so only the latest and previous game versions can hold a valid key; the
previous one only just after an update. Cache discovery now considers only the
two newest version folders, latest first. A version folder counts even without
a cache, so a missing latest cache cannot bring an older version into the window;
a file with a version-like name is not a folder. At the user's direction, the
unversioned `webCaches/Cache` layout is no longer supported.

TDD: the updated resolver test failed while every version plus the unversioned
layout were returned, and again while an unversioned-only cache was accepted;
both then passed. Synthetic fixtures elsewhere moved to versioned caches. A
test case of mine wrongly expected an in-window older version to be rejected
and was corrected. The first full run then failed only on Clippy; binding the
path once fixed it.

`npm run check` then passed: 65 backend unit tests, 33 integration tests, 27
frontend/tooling tests, native offline execution, eight enforcement probes, both
report guards, TypeScript/build, formatting and Clippy. All required per-file
metrics remain 100%, with no new exclusions. `npm run tauri -- build --no-bundle`
passed on Linux. The WSL verification evidence itself is recorded separately.
## Always-visible file fallback (2026-09-27)

Work is on `feat/always-show-file-fallback`, rebased onto `main` at `4486e22` (PR #10).
In the user's WSL run the file fallback could not be tested, because it appeared
only after an automatic failure. The `data_2` chooser is now always shown below
"Find automatically" and stays available after a success. The user's run also
showed "no file selected" beside the chooser after a successful extraction,
because the input was cleared afterwards to allow choosing the same file again.
It is now cleared only when clicked, as the dialog opens, so the chosen file
stays shown with its result.

TDD: a regression test recording writes to the input failed on the post-extraction
clear, then passed; the native test now checks the file stays selected. The two
visibility tests failed while the chooser started hidden and stayed
hidden after success, then passed. The native test now checks the chooser is
visible before the keyboard-operated search. `npm run check` passed: 65 backend
unit tests, 33 integration tests, 28 frontend/tooling tests, native offline
execution, eight enforcement probes, both report guards, TypeScript/build,
formatting and Clippy, with all required per-file metrics at 100%.
`npm run tauri -- build --no-bundle` passed on Linux.

## Real-installation verification (2026-09-27)

The WSL results were recorded in PR #12. The Windows results and the source
table are on `docs/windows-extraction-evidence`, branched from `main` at `953b14d`.
The user verified extraction against a real installation on a custom
drive, from WSL and from a native Windows process: automatic search with the game
closed and running, and the file fallback with a real `data_2`. SmartScreen did
not block the unsigned executable. The WSL automatic runs predate the two-version
window; the Windows runs used the current code. Results, limits and the
supported/unsupported source table are in
[HSR API research](HSR-API-RESEARCH.md#supported-and-unsupported-extraction-sources-2026-09-27).
The roadmap's discovery verification item and all its steps are ticked.

The Windows executable was cross-compiled from WSL with `cargo-xwin` 0.23.1 after
the user accepted the Microsoft Build Tools license. It needed a generated
`icons/icon.ico`, which is added, with the cross-build steps, in a separate change.
The release executable opens a console window beside the app, because `main.rs`
does not select the Windows GUI subsystem. Documentation-only change; no TDD cycle
applies.

## Windows console window (2026-09-27)

Work is on `fix/windows-console-window`, branched from `main` at `ba0f5ce`
(PR #14). The Windows release executable opened a console window beside the app.
`main.rs` now carries Tauri's standard attribute selecting the Windows GUI
subsystem for release builds; debug builds keep the console for logs, and other
platforms ignore it. The user approved changing the guarded wrapper; the
attribute adds no executable code, and the source-body guard pins the new body.

TDD: the updated guard failed before `main.rs` changed, then passed. A
cross-built release executable changed from `PE32+ executable (console)` to
`PE32+ executable (GUI)`. `npm run check` passed: 65 backend unit tests, 33
integration tests, 28 frontend/tooling tests, native offline execution, eight
enforcement probes, both report guards, TypeScript/build, formatting and Clippy;
`main.rs` and `build.rs` remain at 100% in the native gate.
`npm run tauri -- build --no-bundle` passed on Linux. The user ran the updated
Windows executable, and no console window appeared.

## Page request building (2026-09-27)

Work is on `feat/page-requests`, branched from `main` at `7276259` (PR #15).
`RequestContext::page_request` builds the single-endpoint history URL: the five
cached fields keep their encoded bytes and order, followed by fresh `gacha_type`,
`page`, `size=1000` and `end_id`. Cached paging values never carry over.
`Category::ALL` lists the six known categories in contract order, and the parser
now validates `gacha_type` against it instead of its own copy. Pages start at a
non-zero number; the cursor is the start (`end_id=0`) or a previous record, whose
ID is percent-encoded so unexpected bytes cannot escape the query. `PageRequest`
redacts its credential-bearing URL in debug output. No network call is made.

TDD: four request tests failed against a stub, then passed. The first full run
then failed the unit branch gate: no test used the unreserved characters the
encoder leaves as they are. A test for them closed the gap.

`npm run check` passed: 69 backend unit tests, 33 integration tests, 28
frontend/tooling tests, native offline execution, eight enforcement probes, both
report guards, TypeScript/build, formatting and Clippy, all at 100% per file.
`npm run tauri -- build --no-bundle` passed on Linux.

## HTTPS transport (2026-09-27)

Work is on `feat/https-transport`, branched from `main` at `8ced225` (PR #17).
The `Transport` trait fetches one history response; `HttpTransport` implements it
with exactly pinned `reqwest` 0.13.5 and `rustls` 0.23.45 using `ring` and the OS
trust store, as the user chose (see
[decision 0008](decisions/0008-https-transport.md)). It refuses any URL other
than the exact endpoint before sending, follows no redirects, treats any status
other than 200 as an error, uses no system proxy, has 10-second connect and
30-second request timeouts, and stops reading once a body exceeds 2 MiB. No
command uses it yet, and no automated test requests the real endpoint.

TDD: six unit tests, against a scripted `reqwest` double, failed against a stub,
then passed. An integration test builds the real client twice and checks that a
non-endpoint URL is refused before any connection. The dependency tree has `ring`
and no aws-lc, OpenSSL or native-tls. The `cargo-xwin` Windows build still
succeeds, producing a GUI executable.

`npm run check` passed: 75 backend unit tests, 34 integration tests, 28
frontend/tooling tests, native offline execution, eight enforcement probes, both
report guards, TypeScript/build, formatting and Clippy, all at 100% per file.
`npm run tauri -- build --no-bundle` passed on Linux.

## Fetch outcome classification (2026-09-27)

Work is on `feat/fetch-outcomes`, branched from `main` at `2f3c5fb` (PR #18).
`classify` turns one attempt into a parsed page or a `FetchFailure`: `retcode
-101` is an expired key; other nonzero codes are API errors that keep their
number; HTTP 429 is rate limited; timeouts, connection failures and HTTP 5xx are
transient, the only retryable category; other statuses, including redirects, are
rejected; malformed, oversized or inconsistent responses are invalid; and an
unsupported URL or missing client is internal. The API-level rate-limit code is
unknown and is not guessed. No command uses the classifier yet.

TDD: five classification tests failed against a stub, then passed. A refactor
then replaced a wildcard parser mapping with an exhaustive one, so new parser
errors must be classified explicitly. `npm run check` passed: 80 backend unit
tests, 34 integration tests, 28 frontend/tooling tests, native offline execution,
eight enforcement probes, both report guards, TypeScript/build, formatting and
Clippy, all at 100% per file. `npm run tauri -- build --no-bundle` passed on Linux.

## Coverage probe scope (2026-09-28)

Work is on `perf/coverage-probe-scope`, rebased on `main` at `9b9dd3b`. Native
execution is split into unit coverage, Cargo integration, desktop smoke and report
stages; `test:native` composes them in the original order and still freezes the
unit-only report before integration runs. Each enforcement probe now runs only the
stage it tests, restores its files in `finally`, and selects the specific report
check it expects to fail. The backend, wrapper and CSP probes carry an unrelated
panicking integration test, so a regression to the full pipeline fails them. A new
probe rejects a stale unit report. A suite-level `afterAll` then clears all
reports and runs full frontend coverage, the complete offline native suite and
every report gate once, including after a failed probe; its failures propagate.
HTML is rendered only in that final step. Thresholds, inventories, freshness and
the wrapper guard are unchanged.

TDD: stage, scope, regeneration and unit-snapshot tests failed against stubs or
the old broad commands, then passed. A temporary probe that threw after mutating
and restoring a source still failed the command, and final validation ran.
After the rebase, `npm run check` passed with 80 Rust unit tests, 34 integration
tests, 39 frontend/tooling tests, nine probes and five report checks, all at 100%
per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux. Warm local probe-suite
time fell from 217.24 to 70.66 seconds. On hosted CI (PR #20), the `npm run check`
step took 4 min 23 s against 8 min 53 s on the latest `main` run, well within
the 600-second final-regeneration hook limit. A follow-up refactor shares one
report-check helper and unrelated-test fixture across probes and groups the
native scripts in `package.json`; no probe or gate changed.

## CI caching (2026-09-28)

Work is on `perf/ci-pipeline` (PR #5), rebased on `main` at `6d59e12`. CI caches
npm downloads, Rust dependency builds and installed Cargo tools. Keys account for
toolchains, dependencies and the workflow's tool-version pins. Locked installs,
all probes, fresh coverage generation and the release build remain unconditional.

The first version gave no hosted speedup. Two causes were confirmed from CI logs.
asdf keeps Cargo's home inside the toolchain, so the action cached an unused
`~/.cargo` and both tools were rebuilt every run. rust-cache v2.8.2 also pruned
hyphenated crates from the nightly's new build-dir layout: all 65 reused crates
survived its name rule, and every rebuilt crate was pruned or depended on one
(`proc-macro2` among them). CI now exports `CARGO_HOME` from `asdf where rust`
and pins rust-cache v2.9.2, which supports that layout. See
[TESTING.md](TESTING.md#ci-and-handoff).

TDD: the CI guard failed against the v2.8.2 pin and missing `CARGO_HOME` export,
then passed. `npm run check` passed with 80 Rust unit tests, the integration
suite, 42 frontend/tooling tests, nine probes and five report checks, all at 100%
per file, plus TypeScript/build, formatting and Clippy.

Hosted cold/warm pair (run 36432648943): the job took 10 min 21 s cold and 3 min
33 s warm. Warm, tool installs fell from 76 s to 5 s, `npm run check` from 4 min
21 s to 1 min 52 s and the release build from 3 min 22 s to 28 s; only first-party
crates recompiled (5 and 1 units, against 451 and 311 cold). All gates still ran.
The Rust cache is about 822 MiB. Lockfile, toolchain or workflow changes start a
new key; rust-cache then restores its closest earlier entry.

## Cached request URLs (2026-09-28)

Integrated through PR #21 (`0cea1d1`), branched from `main` at `deee662`. This is
the first of three PRs for validating during extraction
([decision 0007](decisions/0007-validate-during-extraction.md)): (A) keep cached
URLs, (B) a validation service, (C) commands and controls that validate and so
contact HoYoverse. Extraction now returns a `CachedRequest` per distinct context,
holding the context and its endpoint-checked cached URL from the context's last
occurrence in the file. Debug output is redacted. The desktop session still
stores contexts only, dropping every URL when the command returns. No network
request, command, permission or UI change was added.

TDD: the new test failed against a stub that kept empty URLs, then passed.
Existing tests changed only to unwrap the context from each cached request.

The first full run failed only on `cargo fmt`; after formatting, `npm run check`
passed: 81 Rust unit tests, 34 integration tests, 42 frontend/tooling tests,
native offline execution, nine probes and five report checks, all at 100% per
file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Auth-key validation service (2026-09-28)

Integrated through PR #22 (`81b4c28`), branched from `main` at `0cea1d1` (PR B of
three for [decision 0007](decisions/0007-validate-during-extraction.md)).
`acquisition::validate` sends at most five cached URLs unchanged, in the given
reverse file order, through a `Transport` and `classify`. It returns the first
context whose response is a valid page, discarding that page's records. `-101`
and other API codes move on to the next context. Rate limits, transient,
rejected, invalid and internal failures stop at once. If all keys are rejected,
it reports an expired key if any expired, otherwise the first code; that
second rule is newly recorded in the contract. An empty input sends nothing and
is internal. Every cached URL is dropped on return. `CachedRequest::url` is now
crate-private. No command calls `validate`, and there are no retries yet.

TDD: against a stub that always failed as internal, four of five tests failed.
The empty-input test passed against the stub, since both return internal
without sending. All five pass with the implementation. The tests use a scripted
`Transport` that records every requested URL.

`npm run check` passed: 86 Rust unit tests, 34 integration tests, 42
frontend/tooling tests, native offline execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Validation during extraction (2026-09-28)

Integrated through PR #23 (`207d61e`), branched from `main` at `81b4c28`, the
last of three PRs for [decision 0007](decisions/0007-validate-during-extraction.md).
Both commands now extract, then validate with HoYoverse through `HttpTransport`
and `validate` in the same user action. The session holds only the validated
context. It is emptied before each extraction, so any failure leaves none, and
every cached URL is dropped when the command returns. Failures cross IPC as
`{"kind": ...}`, with `code` only for `api_error`; new kinds are `expired_key`,
`api_error`, `rate_limited`, `network`, `rejected`, `invalid_response` and
`internal`. HTTP statuses and response text stay native. No command, permission
or CSP change was needed; the webview still has no network origin.

The panel now says the app checks the saved link with HoYoverse and needs a
connection. The button reads "Start retrieval", progress names HoYoverse, and
success says HoYoverse accepted the link. Each validation failure has one
message for both actions; API errors show their code. The typed client accepts
only the exact native shape and maps anything else to `unavailable`.

The native smoke test now refuses to run unless loopback is its only network
interface, since the synthetic key would otherwise reach the live endpoint. In
the offline namespace its file upload shows the network failure message.

TDD: three native command tests failed against a stub that stored the first
extracted context without sending anything, then passed. The failure-mapping
and serialization tests were written with their mappings and passed at once.
Three typed-client tests failed on the old string shape, and six UI tests on
the old copy, then passed. One UI assertion wrongly assumed 'Something went
wrong' was still the last message; it now checks the actual last one. IPC-level
tests cover only failures before any request, because Tauri runs commands on
worker threads that cannot see the thread-local HTTP double; the validation
paths are tested through the same functions on the test thread.

Run directly on the host network, the native test fails in setup with
`expected [ 'lo', 'eth0' ] to deeply equal [ 'lo' ]`, before building or
launching anything. `npm run check` passed: 88 Rust unit tests, 34 integration
tests, 43 frontend/tooling tests, offline native execution including the network
failure message, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux. Real validation against HoYoverse with a live key has not been
run; no automated test contacts the endpoint. After integration, the user ran
the app with a real installation and a current key, and saw "HoYoverse accepted
your warp history link". The expired-key path has not been exercised live.

## Cursor pagination (2026-09-28)

Integrated through PR #24 (`0e4f153`), branched from `main` at `207d61e`.
`acquisition::fetch_history` retrieves all six categories in order from a
validated context. Each starts at page 1 with `end_id=0`; a short page, including
an empty one, ends the category; a full page advances the page number and uses
its last record's ID as the cursor. A cursor repeated within a category is a
cycle. A page with more than 1000 records is invalid, a rule now in the contract.
Retrieval stops at the first fetch failure, or once the summed response sizes
pass 16 MiB, before any further request. The result is a `History` of raw
bodies, with redacted debug output, for `Store::preview`. No command calls it
yet; retries and cancellation are separate steps.

Supporting refactors, with existing tests unchanged: `MAX_BATCH_BYTES` moved from
storage to `hsr.rs` so both share it; `classify` now composes new
`transport_failure` and `parse_body` functions; the validation tests' scripted
transport moved to a shared test double.

TDD: six pagination tests failed against a stub that returned an internal
failure, then passed. They cover category order, cursor and page advancement,
a full final page followed by an empty one, repeated cursors, a two-cursor
cycle, the same ID in another category, over-full pages, four failure kinds,
and the batch bound both exactly reached and passed with later requests
skipped. A new integration test passed on its first run, since it composes
tested pieces: scripted responses go through `fetch_history` into a real
SQLite preview and commit.

`npm run check` passed: 94 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retry budget (2026-09-28)

Integrated through PR #25 (`eb75010`), branched from `main` at `0e4f153`. `Retrying`
wraps any `Transport`. It retries a transient failure (timeout, connection
failure or HTTP 5xx) once for the same URL after a one-second delay, while the
shared `RetryBudget` has one of its two extra attempts left. A failed retry is
returned as it is, and rate limits, other statuses, oversized bodies and internal
failures are never retried. `validate` and `fetch_history` are unchanged; they
take the wrapped transport. Both extraction commands now validate through it,
with a new budget per extraction. The delay value is recorded in the contract.

Open requirement: the budget covers the whole acquisition, so the command that
connects pagination must reuse the extraction's budget rather than start a new
one. The session does not hold the budget yet, because nothing would read it.

TDD: three retry tests failed against a pass-through stub, then passed. A fourth,
that non-transient outcomes return at once without spending the budget, passed
against the stub, as expected of a pass-through. A desktop test with a 503 before
each of two validation responses failed with `network`, then passed after the
command wrapped its transport. Delays are measured on a paused Tokio clock.
The pinned nightly deprecates `AtomicU32::fetch_update`, so the budget uses
`try_update`.

`npm run check` passed: 99 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution (its network failure now waits
for one retry), nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux.

## Acquisition planning gaps (2026-09-28)

Integrated through PR #26 (`8ab916f`), branched from `main` at `eb75010`. Reviewing
what a user knows when cancelling showed three unrecorded gaps, now in the
roadmap. Stopping retrieval while it runs is a different decision from
discarding a preview. It needs no data but has no progress to go on, so live
progress is added as an optional step after cancellation. `Store::preview`
needs a UID and server, and nothing yet takes them from the retrieved pages;
a step before the review DTO now does, following the existing contract rule,
and treats a retrieval with no records as "no history found" rather than an
error. The review DTO step now asks for per-category counts and the covered
time range. Documentation-only change; no TDD cycle or gate run applies.

## Cancellation (2026-09-28)

Integrated through PR #27 (`6fbd17a`), branched from `main` at `8ab916f`. `Cancellable`
wraps a transport with a `CancellationToken`. Once the token is cancelled, it
drops a request in flight or a pending retry delay and refuses every later
request without sending it. The new `TransportError::Cancelled` classifies as
`FetchFailure::Cancelled`, which is never retried and stops `validate` and
`fetch_history` unchanged, so no context or history comes back; retrieval never
writes storage in any case. Desktop gains a native `cancelled` failure kind for
the exhaustive mapping. No command creates or cancels a token yet; the cancel
command, its control and the webview message are added to the acquisition
commands step.

`tokio-util` 0.7.19 is now a direct, exactly pinned dependency without default
features, for `CancellationToken::run_until_cancelled`. It was already resolved
through existing dependencies, so the lockfile gains only the dependency edge.
Its source was checked: an already-cancelled token returns without polling the
request.

TDD: against a pass-through stub, the already-cancelled and
validation/pagination tests failed, and the in-flight and retry-delay tests hung
(the stub ignored the token), then all passed. A pass-through test passed
against the stub, as expected. The mapping variants were added with their
table tests. Timing is measured on a paused Tokio clock.

The first full run failed the backend unit gate on one line of `cancel.rs`:
the closing brace of the hanging test double after `pending().await`, which can
never run. The double now returns `std::future::pending()` as its future, with
no unreachable code; nothing was excluded. `npm run check` then passed: 104 Rust
unit tests, 35 integration tests, 43 frontend/tooling tests, offline native
execution, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux.

## Retrieval progress (2026-09-28)

Integrated through PR #28 (`e3d6558`), branched from `main` at `6fbd17a`, for the
optional roadmap step the user chose to do first. `fetch_history` reports
`Progress::Requesting` before each page request, with the category, page number,
and pages and records received so far. `Retrying` reports
`Progress::RetryPending` before each retry delay, including during validation.
Both take a `Report` (`&(dyn Fn(Progress) + Sync)`). Events hold categories and
counts only. This is native reporting only: the extraction commands pass a
no-op reporter, and forwarding events to the webview, with a cancel control,
is added to the acquisition commands step. Existing tests pass a shared no-op
reporter from the test doubles, so no unused closure lands in covered code.

TDD: a pagination test for the event sequence and totals, and a retry test that
events precede each wait and stop once the budget is spent, failed against
stubs that reported nothing, then passed.

`npm run check` passed: 106 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Account and server resolution (2026-09-28)

Integrated through PR #29 (`4e6fd32`), branched from `main` at `e3d6558`.
`fetch_history` now resolves the account while retrieving: the UID from
records and the server from each page's `region`. Values absent from a page add
no evidence; every value present must match the first, so another account or
server stops retrieval at once (`MixedAccounts`, `MixedServers`).
`History::account()` gives the `Account` to preview under, with redacted debug
output, or `None` when no records were retrieved, a normal "no history found"
outcome that creates no account. Records with no named server anywhere fail
with `MissingServer`. The synthetic `empty.json` fixture has no region, so
empty pages without one are accepted; the researched real responses did carry
region and offset on an empty page. The integration test now previews and
commits under the resolved account.

TDD: three tests (resolution across pages, mismatch stopping retrieval, missing
server) failed against a stub that never resolved an account, then passed. A
fourth, that no records gives no account, passed against the stub, as expected
of one returning none.

`npm run check` passed: 110 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Review DTO (2026-09-28)

Integrated through PR #30 (`0d8cdad`), branched from `main` at `4e6fd32`. Each storage
preview now carries a serializable `Review`: UID, server, timezone offset,
overall counts, counts for all six categories in fetch order (including empty
ones), the earliest and latest record times, and each conflict's ID, category
and time, with no payloads. At the user's choice it holds summary figures only.
A later extension to highlight 5-star characters and light cones is in the
deferred list; rarity, item type and name are already in every record, and only
banner meaning needs metadata. Failure indices for a failed preview are added to
the commands step, where preview errors reach the webview.

Refactors, with behaviour unchanged: `classify` returns each record's status,
and summaries and commit inserts derive from it; its unit tests now assert the
statuses, which state the old counts more precisely. `Category` moved to
`hsr.rs`, re-exported from `acquisition`, so storage need not depend on
acquisition.

TDD: a review test scripting a duplicate, a conflict and a new record across two
categories failed against a stub returning an empty review, then passed. The
integration test now also checks the review from real SQLite.

`npm run check` passed: 111 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Acquisition session and cancel command (2026-09-28)

Integrated through PR #31 (`3479fbe`), branched from `main` at `0d8cdad`: PR A of
four for the acquisition commands, as agreed with the user. The session now
holds the validated context with the retry budget validation started, which
retrieval will continue with, and a cancellation token for the running
operation. Starting an operation cancels any earlier one's token, and a
validated context is kept only if its operation's token was not cancelled,
checked under the session lock, so a cancelled or superseded operation keeps no
late result. Validation runs through `Cancellable`. The new `cancel_acquisition`
command cancels the running operation and drops the context; it is registered
in the command manifest and granted to the main window. The typed client gains
`cancelAcquisition()` and the `cancelled` kind. No UI changed.

Agreed with the user for the remaining PRs: clear the auth key as soon as
retrieval ends rather than at commit; put all acquisition UI (progress, Cancel,
review, messages) in the controls step rather than in each command PR; and
report the failing category and page on retrieval failures instead of preview
indices, since retrieval already validates every page. The roadmap now lists
the commands step as four sub-steps with those requirements.

TDD: three session tests (cancel, late and superseded results, cancelling
mid-validation) failed against stubs, then passed; the mid-validation test uses
a transport that cancels the session after serving a response. The registration
and carried-budget assertions passed at once, as those parts were not stubbed.
Two client tests failed on the missing function and kind, then passed. The
native smoke test now calls `cancel_acquisition` from the real webview.

The first full run failed the backend unit branch gate on one of my test
assertions, `earlier.is_cancelled() && !later.is_cancelled()`, whose
short-circuit paths never ran; it is now two assertions. `npm run check` then
passed: 114 Rust unit tests, 35 integration tests, 44 frontend/tooling tests,
offline native execution including the new IPC call, nine probes and five
report checks, all at 100% per file, plus TypeScript/build, formatting and
Clippy. `npm run tauri -- build --no-bundle` passed on Linux.

## Local database (2026-09-28)

Integrated through PR #32 (`b6e279e`), branched from `main` at `3479fbe`: PR B of four
for the acquisition commands. `desktop::register` resolves Tauri's local app data
folder in its setup hook and manages a `Database` for `history.sqlite` there.
Nothing is created or opened until the first `Database::run`, which creates the
folder, opens the store and then reuses it. `run` executes on Tokio's blocking
pool. A missing or occupied folder, a failed open or a panic in the work gives
the safe storage `Database` error, and a panic drops the store so it reopens.
[Decision 0009](decisions/0009-local-database-location.md) records the location
(`%LOCALAPPDATA%\com.shra-ja.roll-tracker` on Windows, the XDG data folder on
Linux and WSL) and alternatives. The user chose the local folder over the first
proposed roaming `%APPDATA%`, so history never roams with a Windows profile. On
Linux the two folders coincide, so the registration test cannot tell them apart
here; the Windows location needs checking on Windows after the first import.
The roadmap gains the portable-mode item the user asked for, next in milestone 3.
No command uses the database yet.

Test support: the filesystem double gains `create_dir_all`, and the storage
tests' SQL-script helpers are crate-visible so desktop tests can script an open.
The registration test runs Tauri's setup hook through the deprecated
`App::run_iteration`, the only way under the mock runtime, with a
statement-level `#[allow(deprecated)]`.

TDD: three database tests failed against stubs, then passed; the thread test
opens the store on the test thread first, since the blocking thread cannot see
the thread-local doubles. The registration test failed while nothing managed
the database, then passed. A new integration test opens real SQLite in a new
nested temporary folder and passed on its first run, checking nothing exists
before first use.

The first full run failed the backend unit gate twice over. The no-op callback
passed to `run_iteration` never runs under the mock runtime, so it is now a named
function in `src/desktop/tests/events.rs`. And LLVM scores a generic function by
its best single instantiation: each test closure made a new `with_store`
instantiation, none covering every path, though together they did. `with_store`
now takes a boxed closure and its tests share one result type.

Two later full runs were cut short when the WSL VM crashed. Windows' event log
showed it running out of virtual memory, with `vmmemWSL` at 11.7 GB beside other
applications; the Linux journal had no out-of-memory kill or fault. The user
capped WSL at 8 GB with automatic memory reclaim. The check was then run stage by
stage with `CARGO_BUILD_JOBS=8`: every stage of `npm run check` passed (118 Rust
unit tests, 36 integration tests, 44 frontend/tooling tests, offline native
execution, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy). Across the staged runs, use peaked at
about 3.4 GB, with at least 4.5 GB available; the final run followed the switch
to the local app data folder. An earlier staged attempt failed only the source-inventory
gate, which correctly flagged the staging script placed under `test-results/`; it
now lives outside the repository. `npm run tauri -- build --no-bundle` passed on Linux.

## Portable mode (2026-09-29)

Integrated through PR #33 (`8826c15`), branched from `main` at `b6e279e`, at the user's
request ahead of PR C. A folder named `data` beside the executable switches on
portable mode: `database::location` returns it when it exists as a folder, and the
local app data folder otherwise, and `register` passes it the path from
`std::env::current_exe`. The user chose the `data` folder for detection, silent use
of the portable database when both locations have one, and a documented manual
copy for moving history; an in-app offer to copy on the first portable start is
deferred on the roadmap. A file named `data` does not switch modes, and an
unusable `data` folder fails to open rather than falling back. The README now says
where history is stored, how portable mode works and how to copy history between
locations. [Decision 0010](decisions/0010-portable-mode.md) records it.
`desktop::database` is now public for the integration test, and the filesystem
double's metadata gains `is_dir`.

TDD: the location test failed against a stub that always returned the local
folder, then passed. A new integration test creates a real `data` folder beside a
synthetic executable path, opens the database there and checks the local folder is
never created; it passed on its first run.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 119 Rust unit tests, 37 integration tests, 44 frontend/tooling tests,
offline native execution, nine probes and five report checks, all at 100% per
file, plus TypeScript/build, formatting and Clippy, peaking at about 3.5 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retrieve history command (2026-09-29)

Integrated through PR #34 (`301956f`), branched from `main` at `8826c15`: PR C of the
acquisition commands. `retrieve_history` takes the validated context and its budget
out of the session, retrieves every category cancellably while continuing the
extraction's budget, streams progress over a Tauri channel, and drops the context
as soon as retrieval ends, clearing the auth key whatever the outcome. With no
records it returns `no_history` without touching the database; otherwise it
previews under the resolved account, keeps the preview in the session unless
cancelled meanwhile, and returns the review. Retrieval failures carry the failing
category and page. Eight failure kinds are added, two of them for commit. The
command is registered and granted; the typed client gains `retrieveHistory`, the
progress and review types, the new kinds and failure locations. No UI changed.

Test support: `spawn_blocking` is replaced in unit tests by an inline double that
catches panics as Tokio does, so the thread-local SQL double stays visible; the
database integration test now checks the real thread hop and panic handling.
Storage's review types gain `Clone`, and its `preview_script` and `preview`
test helpers are crate-visible. The IPC test window runs Tauri's setup hook, so
the database is managed. All retrieval tests share one test transport, `Serving`,
because coverage scores a generic function by its best single instantiation.

TDD: seven retrieval tests (success with a retry, no history, located failure, no
context or client, database failure, cancelling, the carried budget) failed
against a stub, then passed; a further test covers a preview refused after a
late cancel. The mappings, progress events and registration were written with
their tests. Three client tests failed on the missing function and kinds, then
passed. The native smoke test now calls `retrieve_history` from the real
webview and gets `no_context`, showing the real setup hook manages the database.

During development the native unit gate found gaps, all closed without
exclusions: a retry event never passed through retrieval's reporter, a late
cancel never refused a preview inside `retrieve_into`, the command's second and
third arguments never failed over IPC, and some test closures never ran. It also
split `retrieve_into` across three test transport types, which the shared
`Serving` transport fixed. Run stage by stage with `CARGO_BUILD_JOBS=8`, every
stage of `npm run check` passed: 130 Rust unit tests, 37 integration tests, 46
frontend/tooling tests, offline native execution with the new IPC call, nine
probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.2 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Commit and discard commands (2026-09-29)

Integrated through PR #35 (`6501c59`), branched from `main` at `301956f`: PR D, the last
of the acquisition commands. `commit_import` takes the held preview and commits it
through the database with the current Unix time, returning the summary of rolls
added, duplicates and conflicts. The preview is used up whatever the outcome, so
after a conflict or `stale_preview` the user retrieves again; a commit is atomic
and quick, so it is not cancellable. `discard_import` drops the held preview
without writing. Without a preview, commit fails with the new `no_preview` kind and
discard does nothing. Both are registered and granted; the typed client gains
`commitImport` and `discardImport`. No UI changed. The storage tests'
`commit_script` is crate-visible, and a `stale_commit_script` helper replaces an
inline stale-commit script.

TDD: three native tests (commit, a refused or failed commit, discard) failed
against stubs, then passed; the IPC checks passed against the stubs, as they only
need the commands registered. Three client tests failed on the missing kind and
functions, then passed. The native smoke test now calls both commands from the
real webview. A permission-check outage interrupted the work between the native
implementation and its test run; nothing was committed in between.

The first staged run failed the native unit gate on `commit_import`'s generated
handling of an unmanaged database; the no-database IPC test now calls
`commit_import` as well as `retrieve_history`. Run stage by stage with
`CARGO_BUILD_JOBS=8`, every stage of `npm run check` then passed: 133 Rust unit
tests, 37 integration tests, 48 frontend/tooling tests, offline native execution
with the new IPC calls, nine probes and five report checks, all at 100% per file,
plus TypeScript/build, formatting and Clippy, peaking at about 3.8 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retrieval controls (2026-09-29)

Integrated through PR #36 (`b0c4489`), branched from `main` at `6501c59`: PR A of
two for the review and commit controls. Either start action now validates, then
retrieves: the start controls are hidden and a Cancel button takes focus, the
status names the warp, page and rolls so far or a pending retry, and focus returns
to the starting control at the end. Every retrieval failure, `cancelled` and "no
history found" has a message, prefixed with the warp and page where retrieval
stopped unless the user cancelled. Once Cancel is pressed, progress stops showing;
a success that races the cancel is discarded and reported as cancelled, and a
cancel that cannot be sent re-enables the button. Until PR B adds the review, a
retrieved preview is discarded at once and the panel says how many new rolls were
found. The roadmap gains a step to decide on a component framework, and review the
visual design, before the stored-history display.

TDD: eight new UI tests (the chained flow, warp names, no history, retrieval
failures and four cancel cases) and four updated ones failed on the missing
controls and the old "accepted" result, then passed.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 133 Rust unit tests, 55 frontend/tooling tests, offline native execution
(where the synthetic key fails validation and focus returns to the file chooser),
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.0 GB used.
`npm run tauri -- build --no-bundle` passed on Linux. The running and cancelling
states are covered by jsdom tests only; the offline native test cannot reach them.

## Review and save controls (2026-09-29)

Integrated through PR #37 (`975eb1c`), branched from `main` at `b0c4489`: PR B, which
completes the review and commit controls. A retrieved preview now stays held and
the panel shows a review: a heading that takes focus ("Ready to save 412 new
rolls", "Everything here is already saved" or "Some rolls conflict with your saved
history"), the UID, server and server-time date range, and a table of new, already
saved and conflicting rolls for each of the six warps. Save commits and reports
"Saved 412 new rolls to this device. 88 were already saved."; Discard drops the
preview, and Done replaces both when nothing is new. Conflicts are listed by warp,
time and ID, and Save is disabled and described by the explanation, since the
native commit refuses them. Save failures (`conflict`, `stale_preview`,
`no_preview`, `storage`, `context_mismatch`) have messages, and every ending
returns to the start controls with focus on the control that started. The empty
state now says showing saved history is coming next; it still says there are no
rolls after a save until the stored-history display exists. AGENTS.md now says the
acquisition UI exists.

TDD: six new UI tests (review and save, wording, discard, Done, conflicts and save
failures) and five updated ones failed on the missing review, then passed. A
WebKit (MiniBrowser) screenshot of the built page, with a synthetic native mock in
a scratch copy, checked the review and conflict layouts at 1000 and 390 pixels
wide: focus on the heading and no horizontal scrolling.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 133 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 2.9 GB used.
`npm run tauri -- build --no-bundle` passed on Linux. The review is covered by
jsdom tests and the mocked screenshot; the offline native test cannot reach it.

## Data folder name (2026-09-29)

Integrated through PR #38 (`351ed8a`), branched from `main` at `975eb1c`, after the user
tested PR B on Windows. Cancel, retrieval, the review, saving, the database under
`%LOCALAPPDATA%` and a repeat retrieval all worked. Two follow-ups came out of it:
both collaboration warps returned no records although the account has some (next
task), and the folder name `com.shra-ja.roll-tracker`, Tauri's default from the
bundle identifier, looked out of place.

The folder is now `Roll-Tracker` in the platform's local data folder
(`roll-tracker` on Linux, at the user's choice). The setup hook now opens the main
window, instead of `tauri.conf.json`, so it can put the webview's profile in the
same folder: WebView2 adds its `EBWebView` folder there on Windows, and WebKitGTK
gets a `webview` subfolder, since it writes its folders straight into the one it
is given. In portable mode the profile moves into `data` with the database, so
the app leaves nothing of its own outside it. History saved in the old folder is
moved by hand. Decision 0009 is amended, and decision 0010, ARCHITECTURE and the
README follow.

TDD: three unit tests (the folder name and webview subfolder, the registration
test now expecting the named folder and an opened window, and a window without a
data folder) failed against stubs, then passed. The IPC test helper now uses the
window the setup hook opens.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 135 Rust unit tests, 60 frontend/tooling tests, offline native execution
(the window opened from code, with its title, and WebKit created
`~/.local/share/roll-tracker/webview`), nine probes and five report checks, all
at 100% per file, plus TypeScript/build, formatting and Clippy, peaking at about
3.2 GB used. One 320-byte default-named `.profraw` file appeared in `src-tauri/`;
it came from a manual `cargo test --lib` run before the check, not from the gates
(see the rate-limit pacing section), and was deleted. `npm run tauri -- build --no-bundle` passed on Linux, and
the `cargo-xwin` Windows build succeeded.

## Rate-limit pacing (2026-09-29)

Integrated through PR #39 (`e612e25`), branched from `main` at `351ed8a`. While
testing the data folder on Windows, one retrieval stopped at page 2 with "didn't
accept your warp history link (error -110)"; retrying a little later worked. The
key was about an hour old, and several retrievals had just run with no pause
between requests. Other open-source exporters treat `-110` as "visit too
frequently", so the classifier now maps it to `RateLimited`, which shows the
existing "too many requests" message and stops validation instead of trying
further keys. A new `Paced` transport waits 500 ms before every request, between
`Cancellable` and `Retrying`, in validation and retrieval. The API contract
records the observation, marked unconfirmed, and the pacing.

TDD: the classifier test (now expecting `-110` as rate limited), a validation case
for `-110`, two `Paced` tests (the pause before each request, and cancelling during
it) and a desktop test timing validation and retrieval failed, then passed. A
validation test that used `-110` as an arbitrary rejection code now uses `-111`.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 138 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.7 GB used.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded. A default-named `.profraw` file again appeared in `src-tauri/`,
written before the check started, during a manual `cargo test --lib` run; the
earlier one matched such a run too. Manual Cargo runs reuse artifacts the
coverage gates instrumented, which then write profiles without a configured path.
It was deleted; the gates themselves leave none.

## Collaboration endpoint (2026-09-29)

Integrated through PR #40 (`e558c81`), branched from `main` at `e612e25`. The
Windows test of PR #37 found no records for either collaboration warp, although
the account has some: the normal endpoint accepts `21` and `22` but returns an
empty list, so those rolls were silently omitted. After the user opened both
collaboration histories in the game, a redacted read-only scan of the cache found
them requested from `getLdGachaLog`, and three user-authorized requests confirmed
that keys work on both endpoints and the response shape is identical (see the
[research](HSR-API-RESEARCH.md#collaboration-endpoint-2026-09-29)).

Page requests for `21` and `22` now go to `getLdGachaLog`; extraction accepts
cached requests to either endpoint, so a key found only in a collaboration request
still works; and the HTTP transport's guard allows exactly the two endpoints. The
same key cached from both endpoints is one context. The contract, research notes,
ARCHITECTURE and IMPORTS record the correction. Histories saved before this fix
lack collaboration rolls; retrieving again adds them, as stored rolls are
recognised as duplicates.

TDD: four tests (the endpoint per category, cached collaboration requests
supplying contexts, the transport allowing the collaboration endpoint, and
pagination expecting collaboration URLs) failed, then passed; the refused-URL and
transport-guard cases gained near-miss collaboration spellings.

A Windows retrieval with the endpoint fixed returned exactly 20 records for each
collaboration warp, far fewer than the account has. Fifteen more user-authorized,
paced requests (five pages each at sizes 5, 20 and 1000) showed that
`getLdGachaLog` caps pages at 20, echoing that as `data.size`, and that the
records are identical whatever the size. The short-page rule compared pages with
the requested 1000, so each collaboration warp stopped after its first page.

A first fix compared pages with the echoed size instead; on Windows it rejected
the first Stellar page at once. The saved research responses show `getGachaLog`
always echoes `size` as `"0"`, a fact the synthetic fixtures (echoing `"20"`) had
hidden; it should have been checked before relying on the echo. At the user's
choice, pagination now ends a category only on an empty page and ignores the echo,
at the cost of one request per category with records. A page with more records
than requested is still invalid, and a repeated cursor is still a cycle. Requests
stay at 1000 on both endpoints. The fixtures now echo `"0"`, like real
`getGachaLog` responses, and the contract and research record the evidence.

TDD: the pagination tests were rewritten for the rule, with fixtures echoing
`"0"`: pages of 20, then an echoed `"0"`, then no `size`, continue until an empty
page, and each category with records needs its empty page. Ten failed against the
echoed-size rule, then passed. Desktop, cancellation and integration scripts
gained the empty page after the fixture page.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 142 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.5 GB used.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded.

The user's Windows retrieval with this rule brought in all collaboration rolls,
but took noticeably longer. At the user's request, the roadmap gains an optional
incremental-retrieval design step, with separate quick-refresh and
full-retrieval actions at the user's choice; the roadmap's pagination and endpoint items
are corrected.

## Toolchain refresh (2026-09-29)

Integrated through PR #41 (`1f01756`), branched from `main` at `e558c81`, before the
framework port, so any breakage is attributable to the upgrade alone. There were
no major versions to catch up on; TypeScript 7.0.2, the other Rust crates and the
Cargo-installed tools were already current (Tauri 3 is still alpha).

| Tool | From | To |
| --- | --- | --- |
| Node.js | 26.8.1 | 26.10.0 |
| Rust nightly | 2026-09-16 | 2026-09-28 (rustc 1.101.0) |
| `tauri` / `tauri-build` | 2.11.5 / 2.6.3 | 2.12.0 / 2.7.0 |
| `@tauri-apps/cli` / `@tauri-apps/api` | 2.11.4 / 2.11.1 | 2.12.0 / 2.12.0 |
| Vite / Vitest / `@vitest/coverage-v8` | 8.3.0 / 5.0.1 / 5.0.1 | 8.3.1 / 5.0.2 / 5.0.2 |
| jsdom / `@types/node` | 30.1.0 / 26.6.1 | 30.1.1 / 26.6.3 |

Tauri 2.12 moved several of its own dependencies to new major versions (for
example `tao`, `muda` and `brotli`). `cargo-llvm-cov` 0.9.1, `tauri-driver` 2.0.6
and `cargo-xwin` 0.23.1 were reinstalled for the new nightly, whose rustfmt,
clippy, llvm-tools and Windows target were added. Each asdf Rust version keeps its
own rustup home, so components must be added after switching `.tool-versions`;
the first check run failed on this, and a second on crates not yet fetched for the
offline build, before any test ran. Decisions 0001 and 0006 and the README record
the new pins.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed on the new toolchain, including the nightly branch-coverage probe: 142
Rust unit tests, 60 frontend/tooling tests, offline native execution, nine probes
and five report checks, all at 100% per file, plus TypeScript/build, formatting
and Clippy, peaking at about 4.6 GB used during the full rebuild.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded.

## Vue foundation (2026-09-29)

Integrated through PR #42 (`5424d7c`), branched from `main` at `1f01756`: PR A of two
for the move to Vue ([decision 0011](decisions/0011-vue-frontend.md)). The user
chose Vue over Preact and React for its community, ecosystem and recognition,
TypeScript 6 over 7 until Vue's tooling supports 7, and `create-vue` and Tauri
conventions regardless of the app's size, with small presentational components
since the UI is a placeholder that will be reorganised.

- **Dependencies (exact):** `vue` 3.5.43; dev `@vitejs/plugin-vue` 6.0.9,
  `@vue/test-utils` 2.5.1, `vue-tsc` 3.3.11, `@vue/tsconfig` 0.9.1,
  `@tsconfig/node26` 26.0.1; TypeScript 7.0.2 replaced by 6.0.3.
- **Types:** `tsconfig.json` references `tsconfig.app.json` (browser only),
  `tsconfig.vitest.json` and `tsconfig.node.json`; `npm run typecheck` runs
  `vue-tsc --build`, and `npm run build` runs it first. Mutations confirmed that
  Node's `process` in app code and a template type error both fail. The stricter
  Node settings type `fetch().json()` as `unknown`, so the native test's WebDriver
  helper now declares its response shape.
- **Vite and Vitest:** `scripts/vite-config.ts` holds Tauri's recommended
  settings and the `ui` (jsdom), `tooling` (Node) and `gates` (Node) projects with
  the coverage settings, replacing command-line flags; `vite.config.ts` only
  delegates to it. Vitest hard-codes its config file out of coverage, so the
  delegate is a third guarded exception, pinned in `reports.test.ts` and recorded
  in AGENTS, CONTRIBUTING and TESTING. `.vue` files join coverage and the
  inventory; declaration files, which compile to nothing, are left out of both.
- **Review screen:** `src/components/ReviewPanel.vue` replaces the hand-built
  review markup; `main.ts` renders it only while reviewing and keeps the native
  calls. Warp names and plurals moved to `src/format.ts`. Two UI tests now wait
  for Vue's next render or look elements up again, and four check that the review
  is absent rather than hidden; the behaviour they check is unchanged.

TDD: the config test and six `ReviewPanel` tests failed first (missing files, then
against stubs, and the focus test against a first watcher that focused a tick
late), then passed; the config module's five tests, rewritten for the full
settings, failed against a stub and then passed.

The first full check failed one gate: `npm run coverage` appended an HTML
reporter, which with the reporters now in the config replaced them instead of
adding to them, so no JSON summary was written. The script now lists all four
reporters. Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of
`npm run check` then passed: 142 Rust unit tests, 70 frontend/tooling tests,
offline native execution (loading the Vue runtime under the production CSP),
nine probes and five report checks, all at 100% per file, plus the type check,
build, formatting and Clippy, peaking at about 3.4 GB used. The JavaScript bundle
is 75 KB (29 KB gzipped). `npm run tauri -- build --no-bundle` passed on Linux,
and the `cargo-xwin` Windows build succeeded. WebKit screenshots of the built page
with a synthetic native mock show the review and conflict layouts unchanged.

## Frontend workspace (2026-09-29)

Integrated through PR #43 (`3bec652`), branched from `main` at `5424d7c`. At the user's
request the frontend is now self-contained, like `src-tauri/`, with the same test
rule; there is no behaviour change.

- **Layout:** `src/`, `index.html`, `vite.config.ts` and the app and test type
  projects moved into `src-ui/` with `git mv`. `src-ui/package.json`
  (`roll-tracker-ui`) holds Vue, `@tauri-apps/api` and the frontend's tools; the
  root `package.json` is the npm workspace root with the Tauri CLI, Vitest and
  repository tooling. Tauri builds from `src-ui/dist`.
- **Tests:** unit tests are siblings (`src-ui/src/commands.test.ts`,
  `src-ui/src/components/ReviewPanel.test.ts`, `src-ui/build/vite.test.ts`); the
  whole-page test is the integration test `src-ui/tests/app.test.ts`.
- **Tests and coverage:** each half runs its own tests, as the backend does with
  Cargo. `src-ui/build/vite.ts` holds the frontend's Vite and Vitest settings
  (jsdom, with the Vite config test opting into Node per file), and `src-ui`'s
  `npm test` and `npm run coverage` run them, reporting to `coverage/frontend/`.
  A root `vitest.config.ts` delegates to the new `tooling/vitest-config.ts`, with
  the `tooling` and `gates` projects and tooling coverage in `coverage/tooling/`.
  The root commands run the frontend's, then the tooling's. All reports stay in
  the root `coverage/`, where the gates read them, as the Rust reports already
  do. A first attempt ran everything from the root with the frontend projects
  rooted at `./src-ui`; coverage matched its globs relative to that root and
  missed every frontend file, and the user preferred the frontend to own its
  tests anyway.
- **Types:** the root `tsconfig.json` references `src-ui/` (app, UI-test and build
  projects) and a root Node project; `vue-tsc --build` checks all.
- **Config imports:** both delegates import their modules with the `.ts`
  extension (`./build/vite.ts`, `./tooling/vitest-config.ts`), which Vite's
  planned native config loader requires; it warned on every run before. Both Node
  type projects allow `.ts` imports, which is safe as they never emit. The guard's
  pinned text changed first and failed, then passed.
- **Root tooling:** at the user's request, `scripts/` is split in two. The tooling
  modules (`coverage.ts`, `native-coverage.ts`, `vitest-config.ts`) move to
  `tooling/` with their unit tests beside them, including `ci.test.ts`; the report
  checks and probes join the native end-to-end test in root `tests/`, now defined
  as repository-level verification. At the user's choice, its files were then
  renamed: `e2e-smoke.test.ts`, `close-window-helper.py`,
  `coverage-reports.test.ts`, `mutation-probes.test.ts` and
  `backend-coverage-stages.test.ts`; the helper module became
  `tooling/backend-coverage.ts`, with its functions renamed from `native…` to
  `backend…`.
- **Retiring "native":** the report folders became `coverage/backend-unit/` and
  `coverage/backend/`; the npm scripts became `coverage:backend-unit` (and its
  `:json` form), `test:backend-integration`, `test:e2e-smoke`,
  `coverage:backend-report`, `test:e2e-probe` (and `:stages`) and `test:backend`,
  with `test:offline` and `test:backend-probe` unchanged; the stages became
  "backend coverage report", "reset backend probe" and "backend JSON report", the
  gate "backend wrapper coverage", and the screenshot `test-results/e2e-smoke.png`.
  CI uploads the renamed folders. The helper's test changed first and failed.
- **Gates:** separate frontend and tooling coverage checks, each against its own
  source list; the inventory covers `src-ui/src`, `src-ui/build` and `tooling`,
  excludes `*.test.ts` and the test folders, and pins both delegates. The
  discovery probe adds a failing suite in each tested place, one at a time,
  since the frontend's failure stops the commands before the tooling's; the probe
  refresh also clears `coverage/tooling/`, and CI uploads it. A stale root `dist/` from before the
  move was deleted. Docs and `src-ui/README.md` describe the layout.

TDD: the root Vitest config tests and the Vite config test failed against a stub
and the previous settings at each stage, then passed; so did the report helper's
test of the folders it clears.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 142 Rust unit tests, 41 frontend and 31 tooling tests, offline native
execution (the app built from `src-ui/dist`), nine probes and six report
checks, all at 100% per file, plus the type check, build, formatting and Clippy,
peaking at about 3.4 GB used. `npm run tauri -- build --no-bundle` passed on Linux, the `cargo-xwin`
Windows build succeeded, and `npm run dev` served the app from the workspace on
`127.0.0.1:1420`.

## Vue app structure (2026-09-30)

Integrated through PR #44 (`f85158d`), branched from `main` at `3bec652`. The rest of the
page moves to Vue, following decision 0011, in four commits; retrieval behaves
as before.

- **Shell and router:** `vue-router` 5.3.1 (exact; the version `create-vue`
  installs). `main.ts` mounts `App.vue` on `#app`: the header, a `RouterView`
  inside `<main>` and the footer, so the header and footer are now page landmarks
  rather than sitting inside `<main>`. `router/index.ts` has one hash-history
  route, `views/HomeView.vue`; the wordmark is a `RouterLink` to it. At the
  user's choice there is one view for now; retrieval moves to its own route when
  the stored-history mockup settles navigation.
- **Flow:** `composables/useRetrieval.ts` holds the retrieval flow as read-only
  state (phase, source, status, review, cancelling) and actions, and is the only
  frontend caller of the native commands. The failure, progress and save text
  moved unchanged into `messages.ts`.
- **Components:** `GameSelect` (`v-model`), `EmptyState` and `RetrievalStart`
  join `ReviewPanel`, all presentational. The view moves focus when the phase
  changes: to Cancel while acquiring, and back to the starting control, through
  `RetrievalStart`'s exposed `focus`, when the flow returns to idle.
- **Styles:** at the user's choice, base styles are in `assets/main.css` and
  each component carries scoped styles. One rule for the retrieval introduction
  had matched nothing since the start controls gained a wrapper; it now applies,
  giving that paragraph the same 460px centred width as the text below it.
- **Tests:** unit tests beside each new module cover every failure message, the
  cancel races and each component; the integration tests in
  `src-ui/tests/app.test.ts` keep one case per flow, with focus and the wiring
  between components, and now wait for Vue's next render after each interaction.

TDD: the message, composable and component tests each failed first (missing
modules), then passed; the integration tests passed before and after each step.
A mutation that always returned focus to the search button failed the
file-chooser test.

The first full check failed the frontend report gate: V8 counted no statements in
the router module, a single `export default createRouter(...)`, and the gate
rejects a file with nothing measured, since that also describes a file never
loaded. The module now assigns the router to a constant and exports it, as
`create-vue`'s template does, and is measured. Run stage by stage with
`CARGO_BUILD_JOBS=8`, every stage of `npm run check` then passed: 142 Rust unit
tests, 114 frontend and 31 tooling tests, offline native execution under the
production CSP, the probes and six report checks, all at 100% per file, plus the
type check, build, formatting and Clippy. The native screenshot matches `main`'s
apart from the retrieval introduction's narrower width. The JavaScript bundle is
102 KB (39 KB gzipped) and contains no `eval` or `new Function`.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.

## Linting and formatting (2026-10-01)

Work is on `build/lint-format`, branched from `main` at `f85158d`, following
[decision 0012](decisions/0012-linting-and-formatting.md), in four commits.

- **Tools (exact):** ESLint 10.11.0 in both workspaces with `jiti` 2.7.0 for
  TypeScript configs; in `src-ui`, `eslint-plugin-vue` 10.11.1,
  `vue-eslint-parser` 10.4.1, `@vue/eslint-config-typescript` 14.9.0 and
  `eslint-config-prettier` 10.1.8; at the root, `@eslint/js` 10.0.1 and
  `typescript-eslint` 8.71.0; `@vitest/eslint-plugin` 1.6.27 in both; Prettier
  3.9.9 at the root.
- **Configs:** at the user's choice, each workspace owns its ESLint config,
  with the stricter type-aware rule sets, and one root Prettier config uses
  `create-vue`'s style (no semicolons, single quotes, 100 columns). Both
  `eslint.config.ts` files are guarded delegates to unit-tested modules, pinned
  beside the Vite and Vitest configs. Prettier skips Markdown at the user's
  request, the HSR API fixtures and the agent skills.
- **Reformat:** the second commit only applies Prettier and is listed in
  `.git-blame-ignore-revs`. Vue now keeps a space either side of a button label
  written on its own line, so the integration test's button lookup trims text;
  the guard's pinned delegate bodies lost their semicolons.
- **Findings fixed:** `cancel` and `save` became arrow functions like the other
  composable actions (`unbound-method`); `RetrievalStart`'s `id` attributes
  moved first; tests mark deliberately unawaited calls with `void` and throw
  native failures, which are plain objects, through a `reject` helper; parsed
  coverage JSON and WebDriver responses are typed (`LlvmCoverageExport`, a
  generic request helper) instead of `any`; the report gates use `test.each`;
  the end-to-end network precondition throws instead of asserting in
  `beforeAll`; a regex spells out its six spaces as `{6}`.
- **Gates:** `npm run check` runs `format:check` and `lint:check` (warnings
  fail) first, so CI does too.

TDD: both config tests failed first (missing modules), then passed; the tests
for expectation messages, `expect…` helpers and the stage-runner exemption
failed against the first configs and passed after. A first message fixture used
a string literal, which the rule already allowed, so it passed before the change
and was replaced with a variable. Removing the Prettier override made the
frontend's formatting test fail on six Vue layout rules.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint with no warnings, 142 Rust unit tests, 120 frontend and
36 tooling tests, offline native execution, nine probes and six report checks,
all at 100% per file, plus the type check, build, Rust formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.

## Visual design review (2026-10-01)

A new visual design replaces the placeholder UI. The mockups live on a design
canvas outside the repository, built with synthetic data. They cover the Warp
and Wish history screens, the empty state, and the import flow: choose a
source (retrieval or a manually chosen `data_2` cache file; history-file import
is shown disabled as coming soon), progress, review, saved, and two failures (expired link, game files not found).
The history list has rarity filters, search, list/grid/icon layouts, a pity
column with soft-pity or 50/50 colouring, and styled tooltips.

Decisions from the review:

- Pity treats each pity group's stored rolls as complete and is recalculated
  when older rolls are imported. It is derived on read, not stored; see
  [architecture](ARCHITECTURE.md#statistics). `AGENTS.md` now states this rule.
- Soft-pity colour thresholds are per banner category. 50/50 colouring is
  disabled with a tooltip until banner metadata exists.
- Item icons and banner art stay placeholders. Obtaining real art without
  committing game assets is an open decision that may relax the local-only rule.
- Layouts are fluid: screens fill the window, wrap, collapse the sidebar to
  icons at 900px and drop list columns as space shrinks (Type, then Banner, then
  Time). The minimum window is 480×560, which excludes phones in either
  orientation; mobile is out of scope for now.
- The typeface is Hanken Grotesk, chosen over IBM Plex Sans, Manrope, DM Sans
  and Figtree, and will be bundled. Dark theme only for now.

Documentation only: no code changed and no checks were run.

## Font and minimum window (2026-10-02)

Work is on `feat/ui-foundation`. Hanken Grotesk is bundled from the pinned
`@fontsource-variable/hanken-grotesk` 5.3.0 package (Open Font License): Vite
copies its WOFF2 files into the build, and the base style uses it with a system
fallback. No remote font is requested. The main window's minimum size is now
480×560 (decision 0013), up from 360×580. The roadmap now breaks the
stored-history display into three tracked steps (shell, native page command,
History screen) and moves filters, search, the summary strip, the extra layouts
and pity to milestone 4. The completed API-contract item is ticked.

TDD: the native smoke test now shrinks the window to 320×320 through WebDriver
and checks the webview stays 480×560; it failed at 360×580 before the change.
It also checks, offline, that the page's computed font is Hanken Grotesk and
that the face has loaded; that failed before the package was added.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 120 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed, including the
backend integration tests and the native smoke test.

## App shell (2026-10-02)

Work is on `feat/app-shell`. The webview now has the design's shell: a sidebar
with game and screen links (current ones marked; icons only below a 900px app
width) beside per-game History and Import screens. The app opens on Star Rail's
Warp History, which shows an empty state linking to Import until stored history
is displayed. The existing retrieval flow moved onto Star Rail's Import screen,
unchanged apart from base styles; Genshin Impact's Import screen says retrieval
is coming soon. The shell owns the flow, so a retrieval and its review survive
switching screens. Base styles use the decision 0013 colour tokens. The old
home screen and game dropdown are gone.

TDD: the new shell, routing, persistence and empty-state tests failed before the
sidebar, routes and views existed; the retrieval tests now reach the flow through
the sidebar. The native smoke test opens Import with Enter on the sidebar link.
Its screenshots showed the Cancel button visible after a failure, because a
display style overrode the `hidden` attribute, and the collapsed sidebar still
showing its storage note; computed-style checks failed for both before the fixes.
A temporary canvas measurement confirmed the bundled font renders. The smoke
test now also saves `test-results/e2e-history.png` at the default window size.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 124 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed.

## Import screens (2026-10-02)

Work is on `feat/import-screens`. The Import screen now follows decision 0013,
one step at a time: the sources (retrieval by search or a chosen cache file;
file import shown as coming soon; Genshin Impact's disabled), a progress screen
marking each step with the live status and Cancel, the review (account, summary
strip, server-time period, per-warp table, conflicts, and a fixed footer with
Save, Discard or Done), a Saved screen linking to the history, and a Failed
screen headed by the failure's kind with Try again (device searches), "Choose
cache file…" and Back. Cancels, discards and up-to-date or empty retrievals
return to the sources with a note. The retrieval composable now reports its
stage and outcome instead of a closing status sentence, and failure kinds have
titles. The review's roll preview and per-category progress counts remain their
own roadmap items.

TDD: the composable and message tests failed on the previous code (39 red); the
component tests for the sources, picker, progress, saved and failed screens and
the restyled review failed before the components existed, as did the rewritten
app tests (21 red in total). The native smoke test now reaches the Failed screen
from the automatic search and chooses the cache file there, through WebDriver's
file upload to the visually hidden input. It saves `test-results/e2e-import.png`.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed.

## Mock debug binary (2026-10-02)

Work is on `feat/mock-binary`. A second debug binary, `roll-tracker-mock`, runs
the app against an in-process synthetic HoYoverse
([decision 0014](decisions/0014-mock-debug-binary.md)); the shipped binary is
unchanged. Commands take their transport from a managed `Network` (HTTPS or the
mock); the mock keeps history in its own `roll-tracker-mock` folder, never in
portable mode. Scenarios cover multi-page history, an expired link, a network
failure partway through, a rate limit and no history. `npm run tauri:mock` runs
it by hand. The native smoke test now drives it through retrieval, review,
saving, a second retrieval that finds everything saved, and a network failure,
with screenshots (`test-results/e2e-mock-*.png`); a shared `tests/app-driver.ts`
drives each app. The screenshots showed focus outlines on announced headings,
now removed, and the raw server ID (`prod_official_asia`), now a roadmap item.
Lucide icons are also on the roadmap.

TDD: the mock transport's tests failed on `todo!()` placeholders, then passed;
the desktop tests for the mock network and its separate data folder failed to
compile before `Network` and `register_mock` existed. The coverage gate now lists
and pins the mock binary as a native delegate. A plain `cargo build` had left
uninstrumented binaries, so the first native run found no coverage data until
`cargo clean -p roll-tracker`; the full suite cleans before building. A first
release build also produced the mock binary, so it now needs the `mock` Cargo
feature (`required-features`), which the native tests, `npm run tauri:mock` and
Clippy (`--all-features`) enable; `npm run tauri -- build --no-bundle` builds
only the real app.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 150 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file (the mock
binary and `main.rs` at 100% native coverage), Rust formatting and Clippy.
`npm run test:offline` passed, including all three native tests.

## Saved rarity counts (2026-10-02)

Work is on `feat/rarity-counts`. The import review now counts the new 5★ and
4★ rows (`new_five_star`, `new_four_star`): rows with that rarity among the
rolls being added, not unique items, and never stored or conflicting rows. A
save can only commit the reviewed counts, so the Saved screen shows them in
tiles beside "Existing rolls skipped"; its sentence now names only the account.

TDD: the storage review test, extended with a new 4★ and 3★ beside the stored,
conflicting and new 5★, failed on the missing counts, then passed; the
composable, Saved screen and app tests failed before the counts were carried
through. The end-to-end test checks the mock's 32 five-star and 206 four-star
rows on the Saved screen.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 150 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Stored history page command (2026-10-02)

Integrated through PR #53. Work was on `feat/history-page`. A new `history_page` command reads one page of
saved rolls for a banner category, for the account the latest import went into:
newest first by server time, then by numeric roll ID within the same second (the
HSR contract now records why), each with its position number, item, rarity, type
and time, plus the category's total. Requests are checked before the database is
opened; a bad category, page or page size returns the new `invalid_request`
failure. With no import yet it returns no account and no rolls. It never
contacts HoYoverse; the capability allows it for the main window.

TDD: the storage and desktop unit tests failed to compile before `latest_account`,
`page`, `history_into` and `InvalidRequest` existed. A real-SQLite integration test
covers same-second rolls whose IDs differ in length, paging past the end, category
and account separation, and the latest account switching; dropping the length
tiebreak from the query made it fail. The end-to-end tests check that the
capability refuses a bad request and that the mock's saved history reads back
newest first, with the right total, numbers and last page.
The unit coverage gate then caught untested row-reading failures in
`latest_account`, a failing account query, and the generated checks for each
`history_page` argument; tests now cover them.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 157 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage
integration tests and all three end-to-end tests.

## Category totals (2026-10-03)

Integrated through PR #54. Work was on `feat/category-totals`. Each `history_page` result now also counts
the account's rolls in every category, in `Category::ALL` order with zeros for
empty ones, so the History screen's tabs can show their counts from one read.
One grouped query replaces the selected category's count, which is taken from
it. A count for an unknown category is reported as damaged storage. With no
import yet every count is zero.

TDD: with the new types stubbed to return no counts, seven storage and desktop
unit tests failed (the old count query and the missing counts), then passed. The
real-SQLite integration test checks the counts beside empty categories and
another account; the end-to-end test checks the mock's six counts.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage
integration tests and all three end-to-end tests.

## History screen (2026-10-03)

Integrated through PR #55. Work was on `feat/history-screen`. Star Rail's History screen now shows saved
history, read from this device only, never HoYoverse. The header shows the
account the latest import went into (UID and server, as text until accounts can
be switched). Category tabs carry their counts; the counts drop and then the tabs
become a "Banner category" dropdown when hidden copies of the tab row, measured
against the available width, show they no longer fit. The list shows #, item
(with a rarity-tinted initials placeholder), rarity, type and server time with
the offset in its header, newest first; Type and then Time drop out as the list
narrows. A pager shows the range, page numbers around the current page with the
first and last, and 20, 50 or 100 rows per page. The screen opens on Character
Event Warp, or on the first category with rolls when that has none. An empty
category says so; with nothing saved, and for Genshin Impact, the empty state
still links to Import. A failed read shows an alert with Try again. The
`historyPage` command wrapper and the `invalid_request` failure kind are added.
Filters, search, the summary strip, the other layouts and pity stay in
milestone 4.

With 14 components, `src-ui/src/components/` is now grouped by where each is
used: `layout/` (sidebar, screen header), `history/`, `import/` and `shared/`
(the cache picker), each test still beside its component. The frontend README,
which still described the old home screen, now describes the current layout.

TDD: the command, message and format tests failed before `historyPage`,
`invalid_request`, `historyFailure` and the new format helpers existed (8 red);
the `useHistory` tests and the five component tests failed before their modules
existed, and the four new app tests failed on the old History screen. The
end-to-end test now follows "View warp history" from the Saved screen of the
mock binary, checks the account, the six tab counts, the time offset and the
newest rows, pages forward, and saves `test-results/e2e-mock-history.png`.

The History screen's read opens the database on launch, so an empty database now
appears before the first import (the user accepted this over skipping reads
without a file). The mock network-failure test now checks, through the app, that
no rolls were saved, instead of that no file exists. In the end-to-end
screenshots the tabs show their counts in a 1280px window and become the
dropdown at the 480px minimum, where Type and Time have dropped out
(`e2e-mock-history.png`, `e2e-mock-history-narrow.png`); the first run showed the
counts already dropping at the default window size.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 188 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Server names (2026-10-03)

Integrated through PR #56. Work was on `feat/server-names`. Star Rail servers now show as the game names them
wherever the account appears (the History screen's account, the review's account
and the Saved screen's sentence): `prod_official_usa` America,
`prod_official_eur` Europe, `prod_official_asia` Asia, `prod_official_cht`
TW, HK, MO, `prod_gf_cn` China and `prod_qd_cn` China (Bilibili). Any other
server shows as given. Only the display changes; the reported value is stored
and compared as before. The names follow the game's server list; only the mock's
`prod_official_asia` is exercised end to end, and no real response is recorded
for the others.

TDD: the format, message and three component and app tests failed before
`serverName` existed and was used (6 red); existing tests with the unknown
`synthetic-server` cover the fallback. The end-to-end test checks "Asia" in the
review, the Saved sentence and the History screen's account.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Lucide icons (2026-10-03)

Integrated through PR #57. Work was on `feat/lucide-icons`. The hand-drawn inline SVG icons are now Lucide
icons from `@lucide/vue` 1.51.0 (ISC licence), pinned like the other
dependencies; `lucide-vue-next`, named on the roadmap, is deprecated in its
favour. Each icon is its own import, so only the ten used are bundled (the
script grew by 0.8 kB), and each is hidden from assistive technology as before.
The brand mark stays custom; the game monograms are text. Decision 0013 now
names Lucide. No behaviour changes. This completes the stored-history display.
`npm audit` reports four high-severity findings in `braces`, which only the
dev tooling pulls in (through the ESLint TypeScript config); the lockfile change
adds only `@lucide/vue`.

TDD: a new app-test check that every icon on each screen (except the brand
mark) is a decorative Lucide icon, with the expected names, failed on the
hand-drawn icons in 6 tests, then passed.

The end-to-end screenshots show the new icons in the sidebar, the sources,
the pager and the selects.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## ESLint test warm-up (2026-10-03)

Work is on `fix/eslint-test-warmup`. The `main` build after PR #57 (run #128)
failed: the frontend ESLint config test's first case took 6.2 s against
Vitest's 5 s limit. It was the first type-aware lint, which builds the
TypeScript program; over the previous 16 CI runs it took 2.1–4.8 s, and the
tooling config test's first case 2.0–3.8 s, against about 0.6 s locally. Nothing
in PR #57 caused it; the same code passed on the PR. Both tests now build the
program in `beforeAll` by linting a trivial file, under a 60 s hook timeout, so
each test times only its own checks.

Red/green: with `--testTimeout=400` standing in for a slow runner, the first
case of each file timed out before the change (606 ms and 755 ms) and both files
passed after it; locally the frontend's first case fell from about 600 ms to
16 ms.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed. Test-only change, so no
release build was needed.

## Next

The remaining milestone 3 items: the Import screen's "Last import" line,
per-category page counts in retrieval progress, and the end-to-end verification
items. Incremental retrieval is an optional design step.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](STATUS-HISTORY.md).
