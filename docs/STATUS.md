# Project status

Updated: 2026-09-27

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

## Next

Verify automatic extraction against a real installation from native Windows and
from WSL, and record supported and unsupported sources with evidence. Synthetic
tests do not establish installed-game compatibility. Then implement the
contract's request building, transport, outcome classification, auth-key
validation, pagination, retries and cancellation, followed by the review DTO,
atomic commit and history display, clearing auth keys when an import ends.
Account/server verification remains a milestone-closing requirement.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](STATUS-HISTORY.md).
