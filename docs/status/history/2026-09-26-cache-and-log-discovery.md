# 2026-09-26: cache and log discovery (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

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
[decision 0005](../../decisions/0005-current-user-windows-discovery.md) for the pinned
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
