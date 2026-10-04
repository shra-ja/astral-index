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

## From TESTING.md

### Cache extraction review regressions (2026-09-26)

`cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test acquisition`
includes two bounded subprocess regressions. On Unix, selecting a synthetic FIFO
with no writer must return `NotRegularFile` within three seconds. A cache with
80,000 distinct contexts and repeated entries, below the byte limit, must preserve
count and first-seen order within ten seconds. The parent terminates a stuck child
so either regression fails without hanging the suite. The FIFO test uses `mkfifo`
on the Unix test host.

Both failed before the fixes on their respective deadlines. After nonblocking
Unix opens and hash-set deduplication, the FIFO returned immediately and the large
cache test completed in approximately 0.43 seconds in the focused debug run.
The filesystem double also asserts read-only and Unix nonblocking open options;
existing unit tests cover successful reads, open/metadata failures, non-regular
handles and byte bounds.

### Selected Windows cache foundations (2026-09-25)

On `feat/hsr-request-extraction`, the initial extraction/file tests were run against
error-only implementations. They failed on successful extraction, oversize-input
classification and reading a selected file. The game-directory resolver test also
failed before implementation. The focused command is:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib acquisition
cargo test --manifest-path src-tauri/Cargo.toml --offline --test acquisition
```

The initial six tests exercised binary cache framing, preservation of encoded context,
deduplication, safe diagnostics/debug formatting, unsupported and ambiguous URLs,
truncated candidates, read/size failures, unchanged real files, and legacy/versioned
Windows directory layouts with numeric ordering. Injected reader and directory
iterator errors exercise the same implementation as real I/O. Tests use synthetic
credentials and temporary directories and never initiate history requests.

These tests run on the Ubuntu/WSL development host. They do not verify a real
Windows installation, native Windows sharing/permission behavior, or automatic
Windows profile/WSL mount discovery. The Windows/WSL support matrix is recorded in
[research](#initial-source-reader-increment-2026-09-25).

### Unit-first backend testing (2026-09-25)

Rust unit tests live beside their implementation in `#[cfg(test)] mod tests` in
`src-tauri/src/acquisition.rs`, `hsr.rs` and `storage.rs`. Supporting filesystem
and SQLite doubles live in adjacent `tests/` subdirectories and are imported only
under `cfg(test)`. Unit tests execute the same service bodies as production, but
never use real filesystem or database operations. The SQL double checks outgoing
SQL, bound values, transaction ordering and cleanup; it is not a fake SQL engine.

Cargo integration targets are `src-tauri/tests/acquisition.rs` and `storage.rs`.
They use real files and SQLite to check persistence, constraints, rollback,
repeated/overlapping imports and the behavior assumed by the doubles. Fixtures
stay under `src-tauri/tests/fixtures/`. Frontend and top-level application tests
remain separate. There are 39 backend unit tests and 27 backend integration tests.

`tests/native.test.ts` clears profiles, runs `cargo test --lib --locked --offline`,
and saves JSON/HTML under `coverage/native-unit/` **before** running integration
or desktop tests. The report gate checks every backend source file against that
unit-only report. Subsequent execution produces `coverage/native/` for the three
explicit exceptions: `src-tauri/src/main.rs`, the mock debug binary
`src-tauri/src/bin/roll-tracker-mock.rs` and `src-tauri/build.rs`. Each still
requires 100% coverage. Exact source-body assertions guard these minimal delegates;
adding behavior forces review of the exception. New Rust source defaults to the
unit-only gate, including I/O and database functionality. This exception was
explicitly authorized by the user and is documented in CONTRIBUTING and AGENTS.

The new report requirement first failed on the missing unit-only report, despite
an existing native report. The service refactor then reached 100% lines, regions,
functions and branches from mocked unit tests alone; no thresholds were lowered.
Additional probes cover an integration-only function that is fully exercised by
integration tests but must still fail the unit gate, a missing/empty unit report,
and added startup behavior rejected by the exception guard. Together with the
previous five probes these make eight enforcement tests.

CI archives frontend, unit-only and native JSON/HTML reports separately. The same
`npm run check` gate runs locally and in CI. Windows installation/native behavior
remains unverified; these checks run on the Ubuntu/WSL development environment.

Final `npm run check` passed: 39 unit tests, 27 real-boundary integration tests,
17 frontend/tooling tests, native offline integration, eight enforcement probes,
both report/exception checks, formatting, TypeScript and Clippy. All required
per-file metrics are 100% from the appropriate independent report. No thresholds
were lowered and no production functions were excluded.

### Current-user discovery (2026-09-26)

The first four system-discovery unit tests failed against stubs before the
Windows folder lookup, WSL helper orchestration and bounded subprocess reader
were implemented. The real-process integration test subsequently exposed
unreliable prompt reaping when relying solely on kill-on-drop. Explicit,
deadline-bounded kill/wait cleanup made that regression pass. Two further tests
failed before adding native folder validation for nonlocal/malformed and
non-Unicode paths.

Unit tests replace environment reads, Known Folder lookup, process spawning and
filesystem access. A paused Tokio clock exercises process/cleanup deadlines and
cancellation without real waiting. Tests verify exact helper arguments, byte
limits, error redaction, failed current-log mapping with a usable previous log,
and no game-source access before path validation.

`src-tauri/tests/system_discovery.rs` runs only on Linux. Child test processes
receive isolated PATH entries containing synthetic helpers; they never invoke
the real Windows tools. These tests verify real stdout pipes, failed/oversized/
stalled helpers, termination/reaping and unchanged log bytes. Synthetic executables
model the helper protocol, not native Windows Known Folder or WSL interop behavior.
The regular unit-only coverage gate covers all new production source; no wrapper
exception or coverage exclusion was added.

Final `npm run check` passed with 56 backend unit tests, 33 integration tests,
17 frontend/tooling tests, native offline execution, eight enforcement probes,
both report guards, TypeScript/build, formatting and Clippy. Required per-file
coverage is 100%, including unit-only backend coverage.

## From api-research.md

### Initial source-reader increment (2026-09-25)

The native reader now supports an explicitly supplied regular cache-file path.
Synthetic tests on the Ubuntu development environment verify real file reads,
unchanged file bytes, binary surroundings, the researched `1/0/` and NUL framing,
encoded request fields, distinct candidates and bounded failures. This implements
the extraction method described above; it does not independently revalidate a
live installation or credential validity. No private source or live API was used.

| Source | Current support and evidence |
| --- | --- |
| User-provided cache file (fallback) | Native service and file chooser implemented. A real `data_2` extracted successfully from WSL and native Windows on 2026-09-27; see [supported sources](../../games/hsr/api-research.md#supported-and-unsupported-extraction-sources-2026-09-27). |
| Internally resolved Windows game-data directory / versioned `webCaches` paths | Native resolver implemented; synthetic directory tests verify the two-newest-version window, numeric ordering, the unsupported unversioned layout and missing caches. Real installations with version folders worked from WSL and native Windows on 2026-09-27. |
| Windows installations accessed from WSL | Explicit mount-root mapping and current-user folder/path lookup implemented and verified against a real custom-drive installation on 2026-09-27, including while the game was running. |
| Windows Player.log / Player-prev.log discovery | Bounded reader supports supplied AppData and current-user Known Folder lookup. Worked on a real installation from WSL and native Windows on 2026-09-27; which log supplied the path is not reported. |
| macOS installation discovery | Unverified and unimplemented. |

Windows is the initial game-installation target, with discovery from Windows and
WSL. Real-installation verification from both completed on 2026-09-27; see
[supported sources](../../games/hsr/api-research.md#supported-and-unsupported-extraction-sources-2026-09-27).

### Player-log reader increment (2026-09-26)

Inspection of the beginning of the user-provided PowerShell reference confirms
that it obtains Windows' roaming `ApplicationData` folder through the folder API,
then looks in sibling `LocalLow/Cognosphere/Star Rail`. It reads the first
11 lines for `Loading player data from ` and the `data.unity3d` path.
The script was inspected, not executed; this is evidence of its discovery method,
not independent verification against an installed game.

The native service now accepts that AppData location explicitly, checks both logs
independently, bounds header input to 64 KiB, and validates paths before returning
candidates. WSL callers supply a host-native AppData path and explicit mount root.
Microsoft documents that WSL's default `/mnt/` automount root
[can be changed or automount disabled](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#automount-settings),
so the service does not hard-code it or infer drive availability.
Synthetic tests cover Unicode/spaces, normalized drive letters/separators, custom
mount roots, missing/malformed logs, line/byte bounds, and read-only traversal
from a log candidate to a selected cache. System-folder integration, desktop
selection and native Windows/live-installation verification remain pending.

### Current-user discovery increment (2026-09-26)

The current-user service now supplies the previously explicit AppData location.
On Windows, `dirs` 6.0.0 uses the
[Known Folder API for roaming AppData](https://docs.rs/crate/dirs/6.0.0/source/src/win.rs).
On WSL-marked Linux, a fixed PowerShell expression queries the Windows folder,
then `wslpath` translates AppData and the game-directory candidates. Microsoft
documents [Windows executable interop and path translation](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop#path-translation).
No Windows username or common mount root is inferred.

The helper policy is five seconds per execution, 32 KiB stdout, discarded stdin/
stderr, and up to five seconds for error cleanup. Processes are terminated and
reaped after errors; cancellation uses Tokio's kill-on-drop behavior. Tests use
mocked environment/folder/process APIs and separate synthetic Linux executables,
including failures, large output, timeouts, real cleanup and unchanged log bytes.
No live Windows helper, private profile or game log was used in automated tests.

Automatic discovery requires Windows, or Linux with nonempty `WSL_DISTRO_NAME`
and working `powershell.exe`/`wslpath` on PATH. Missing interop/tools and malformed,
non-Unicode, relative or UNC/device folder paths produce safe errors. Explicit
file upload remains the fallback. Redirected roaming profiles whose logs
are not in the derived sibling LocalLow location are not verified.
Real Windows Known Folder behavior, WSL Windows-process cancellation, actual
game-log/cache layouts and desktop extraction controls remain to be verified/connected.
