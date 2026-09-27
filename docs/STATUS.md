# Project status

Updated: 2026-09-28

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

## CI cache increment (2026-09-27)

On `perf/ci-pipeline`, the workflow now caches npm downloads, Rust dependency
builds and installed Cargo tools. Cache keys account for toolchains, dependencies
and the workflow's tool-version pins. Locked installs, all probes, fresh coverage
generation and the production desktop build remain unconditional. npm prefers
cached downloads and omits its install-time audit request.

TDD: the new cache-policy guard failed against the uncached workflow, then both
workflow guards passed after implementation. `npm run check` passed with 56
backend unit tests, 33 integration tests, 19 frontend/tooling tests, eight probes,
both report guards and all required coverage metrics at 100%. TypeScript/build,
formatting, Clippy, actionlint 1.7.7 and `git diff --check` passed.
`npm run tauri -- build --no-bundle` passed on Linux.
Hosted cold/warm cache behavior and timings require CI runs; no hosted speedup
has been measured yet. Reducing the scope of repeated native probe runs remains
follow-up work.

## Next

Validate contexts during extraction
([decision 0007](decisions/0007-validate-during-extraction.md)): extraction must
keep one cached URL per context until validation ends, validation sends each
unchanged through the transport and classifier, and only the first working
context stays in the session. Update the controls, which will then contact
HoYoverse, and their failure messages. Then pagination, retries and cancellation,
followed by the review DTO, atomic commit and history display, clearing auth
keys when an import ends. Account/server verification remains a
milestone-closing requirement.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](STATUS-HISTORY.md).
