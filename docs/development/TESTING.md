# Testing and coverage

## Scope and metrics

`npm run check` is the authoritative local and CI gate, exiting at the first
failed stage. UI tests verify empty-state copy, accessible labels and game
selection. The native WebDriver test launches the real instrumented Tauri binary,
loads bundled assets from `tauri:`, exercises keyboard selection, checks external
fetch is blocked by CSP, saves a screenshot and closes through an X11 window-manager
message. It waits for that process's LLVM profile; forcibly killing the app
cannot count as successful native coverage.

The offline command wraps that test in Bubblewrap's isolated network namespace.
Only loopback is available for WebDriver; there is no external network route or
Vite server. Cargo uses pre-fetched dependencies with `--locked --offline`.
Ubuntu's hosted runner restricts unprivileged user namespaces. CI loads a narrow
AppArmor profile for a CI-only copy of `/usr/local/bin/bwrap`, granting that
executable user namespaces without turning off the system-wide restriction.
The preflight must succeed; the offline test is never skipped or run online as
a fallback. See [Ubuntu's namespace policy](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).
This is a native development build with production bundled assets. Installer
packaging and other operating systems are later release work.

Backend execution is split into explicit stages. `coverage:backend-unit` cleans the
workspace's instrumentation data, runs only library unit tests and freezes their
report. `test:backend-integration` runs Cargo tests, `test:e2e-smoke` builds and
launches the desktop, and `coverage:backend-report` renders combined evidence.
`test:backend` composes those stages in that order; `test:offline` isolates the
whole sequence. Individual stages are diagnostic building blocks, not substitutes
for the complete gate. Report rendering never executes tests and cannot establish
freshness on its own. The shared tooling in `tooling/backend-coverage.ts` has
mocked unit tests and is included in the 100% tooling coverage inventory.

`test:backend-probe` is a network-isolated probe-only stage. It resets counters,
freezes unit JSON, runs only the synthetic `unit_coverage_probe` integration
target and writes combined JSON. An unrelated failing integration fixture proves
that this stage does not execute the full integration suite. Report validation
has independently selectable frontend/tooling, backend-unit and wrapper tests;
the complete command still requires every scope, source inventory and wrapper
body guard. The probe asserts that integration coverage cannot fill a unit gap.

`test:e2e-probe` resets instrumentation, builds/runs the desktop in the network
namespace and writes only JSON coverage. It never runs backend tests. The branch
probe validates the wrapper report directly, and the CSP probe still requires the
specific security-policy assertion failure. Both carry an unrelated failing
integration fixture to prevent accidental regression to the full native pipeline.

`test:probes` first prepares JSON-only frontend and unit evidence, then runs the
mutation suite. Every probe restores its files immediately in `finally`;
report-only probes select the relevant report check. A suite-level `afterAll`
clears old reports and runs frontend/tooling coverage, the complete offline native
sequence and all report gates once. It also runs after a failed probe assertion;
the original failure still fails the command. HTML is rendered only during this
final sequence. A failed final stage propagates its error and cannot reuse the
previous reports. Unit snapshots are invalidated before unit execution begins.

`check` builds bundled assets before invoking this self-contained probe pipeline.
The final sequence still executes all backend unit/integration tests and the real
desktop smoke test. Nine probes now include explicit stale-report rejection;
none of the existing enforcement properties or coverage thresholds was removed.
Run `npm run build` before standalone `test:probes`. Individual low-level Vitest
probe selections require the JSON preparation commands first.

| Source | Instrumentation | Mandatory per-file metrics |
| --- | --- | --- |
| `src-ui/src/**/*.{ts,vue}`, `src-ui/build/**/*.ts` | Vitest V8, the frontend's own run, to `coverage/frontend/` | Lines, statements, functions, branches: 100% |
| `tooling/**/*.ts` | Vitest V8, the root `tooling` project, to `coverage/tooling/` | Lines, statements, functions, branches: 100% |
| Backend `src-tauri/src/**/*.rs` (except `main.rs`) | cargo-llvm-cov, **unit execution only** | Lines, regions, functions, branches: 100% |
| `src-tauri/src/main.rs`, `src-tauri/src/bin/roll-tracker-mock.rs`, `src-tauri/build.rs` | Separate native boundary coverage; guarded minimal delegates | Lines, regions, functions, branches: 100% |
| `src-ui/vite.config.ts`, `src-ui/eslint.config.ts`, `vitest.config.ts`, `eslint.config.ts` | None: Vitest always excludes config files; guarded one-line delegates to `src-ui/build/vite.ts`, `src-ui/build/eslint.ts`, `tooling/vitest-config.ts` and `tooling/eslint-config.ts` | Not measurable; the delegated modules are at 100% |

LLVM uses executable regions rather than a distinct Rust statement metric. Zero
branch points means there are no branches to cover; startup has no handwritten
conditionals, while the HSR parser has measured validation branches. An automated probe adds an actual conditional and
verifies LLVM reports a missed branch before restoring the source. Macro-generated
mappings remain in the report; handwritten native glue is not excluded.

`tooling/coverage.ts` compares integer covered/total counts, so rounded percentages
cannot pass. The validator itself has 100% coverage. `tests/coverage-reports.test.ts`
inventories source independently of execution and rejects absent, empty or stale
reports. New executable files outside the instrumented directories fail the
inventory check until instrumentation is added. V8 includes unexecuted files; the
inventory also catches Rust source never compiled into a module. Each run clears
its own report directory and Rust counters and rebuilds first-party Rust,
including `build.rs`.

Exclusions are limited to:

- Sibling `*.test.ts` files, `src-ui/tests/`, `src-tauri/tests/` and root
  `tests/`: test code, test helpers and synthetic
  fixtures only. Frontend/tooling coverage
  and source inventories explicitly exclude those test directories; production
  source globs and per-file thresholds are unchanged.
- `src-tauri/src/**/tests/**`: supporting unit-test doubles only, imported under
  `cfg(test)`. The real service implementation remains in the instrumented parent
  files; no production logic is excluded.
- `node_modules/`, Cargo dependencies and `src-tauri/target/`: third-party or generated artifacts.
- `src-tauri/gen/`, `src-ui/dist/`, `coverage/`: mechanically generated output.
- HTML, CSS, SVG/PNG, Markdown, lockfiles and declarative JSON/YAML/TOML: no
  instrumentable TypeScript/Rust control flow. They are exercised by native smoke
  tests, builds and schema checks as applicable.

There are no coverage-ignore annotations or handwritten production-source exclusions.
Workflow steps and npm scripts compose tool commands; the custom executable gate
is TypeScript and is instrumented.

## CI and handoff

`.github/workflows/check.yml` installs pinned asdf toolchains and coverage tools,
runs `npm run check`, then builds the production native binary. It uploads
HTML/JSON reports and the native screenshot, including on failures. The required
job is **Tests and 100% coverage**. Configure that status in branch protection
after the first hosted run; local success does not prove remote CI ran.

CI caches npm's download store, Cargo dependencies and their build artifacts,
and installed Cargo tools with installation metadata. The cache actions are
pinned to commits. npm's key includes the OS, architecture, `.tool-versions` and
lockfile. Rust's key includes the compiler, manifests/lockfile and build settings;
an additional workflow/toolchain hash invalidates it when pinned tool versions
change. Workspace crates are not retained by the Rust cache action.

asdf keeps Cargo's home inside the toolchain (`asdf where rust`), so CI exports
it as `CARGO_HOME` before the cache step; otherwise the action saves an unused
`~/.cargo` and tools are rebuilt every run. The pinned nightly uses Cargo's new
build-dir layout (`target/<profile>/build/<crate>/<hash>/`). rust-cache releases
before v2.9.2 prune hyphenated crates from that layout, which forces nearly the
whole dependency tree to rebuild; keep v2.9.2 or later.

Locked installs always run, including after cache hits. Cargo reuses installed
tools at the requested versions; npm prefers cached downloads and skips the
install-time audit request. Coverage reports are generated afresh by the existing
cleaning/test sequence, never restored as evidence. All probes, coverage gates
and the release build still run on every CI invocation. Cache misses use the
normal installation/build path. Compare cold and warm hosted runs before claiming
a speedup.

Do not run probes concurrently with editing, coverage or native builds. They
mutate source briefly and restore it in `finally` blocks. After interruption,
inspect `src/coverage-probe.ts`, `src-tauri/src/coverage_probe.rs`,
`src-tauri/src/main.rs`, `src-tauri/src/lib.rs`,
`src-tauri/tests/unit_coverage_probe.rs`, and report backup files before resuming.

## Connectivity scope after decision 0002

The `test:offline` command verifies local shell behavior in an isolated network
namespace; it does not impose an offline-only product requirement. The webview's
external-fetch rejection remains intentional. Future user-requested HoYoverse
acquisition runs through a native client. All automated tests must remain local
and self-contained, with appropriate HTTP mocks or isolated local test servers
and synthetic responses. No live HoYoverse requests or player credentials are
allowed in tests. Add coverage for
pagination, errors, cancellation, and absence of unrequested fetching. See
[decision 0002](../decisions/0002-user-requested-history-acquisition.md).

## Milestone 2 review fixes (2026-09-25)

Work continues on `feat/hsr-response-foundations`; the reviewed history is preserved.
Before implementation, raw synthetic regressions reproduced loss of distinct large
integers/precise decimals, duplicate JSON-member acceptance, corrupt stored
identity/domain values escaping history reads, and signed/extended timestamp years.
The updated acquisition-first UI assertion also failed against the previous copy.
An additional failing frontend suite was initially ignored by `npm test` (exit 0),
proving the runner-discovery gap independently of coverage.

After fixes, `npm run check` passed with 46 Rust tests (32 storage/library tests
and 14 parser tests), 17 frontend/tooling tests, real offline native integration,
five failure/discovery probes, source inventory and fresh-report validation,
TypeScript/build, Rust formatting and Clippy. The sandbox cannot create the
bubblewrap network namespace; the authorized outside-sandbox run retained the
native test's network isolation. No live APIs or real player data were used.

The native test now requires an enforced `connect-src` security-policy violation.
Its mutation probe relaxes that directive, observes failure at the CSP assertion,
restores configuration, and repeats the native run. A rejected fetch alone cannot
pass. Discovery probes add deliberately failing suites beside frontend source, in
`src-ui/tests/`, in `src-ui/build/` and in `tooling/`, verify that both `npm test` and `npm run coverage` fail and
report each suite, then remove them and regenerate clean coverage. Report and
mutation suites remain explicit commands outside unit discovery.

Fresh native coverage (regions are the Rust statement metric):

| File | Lines | Regions | Functions | Branch outcomes |
| --- | ---: | ---: | ---: | ---: |
| `lib.rs` | 40/40 | 41/41 | 5/5 | 10/10 |
| `hsr.rs` | 62/62 | 72/72 | 7/7 | 42/42 |
| `storage.rs` | 200/200 | 268/268 | 23/23 | 38/38 |
| `main.rs` | 6/6 | 4/4 | 2/2 | 0/0 |
| `build.rs` | 3/3 | 3/3 | 1/1 | 0/0 |

Frontend/tooling remains at 100% per file for lines, statements, functions and
branches. No unsupported metrics, new exclusions or ignored paths were introduced.
New cases also cover known/unknown timezone sequences in both directions,
including empty terminal pages; malformed indexed identity; nested duplicate
members; excessive nesting; and lossless numeric persistence after restart.

`npm run tauri -- build --no-bundle` and `git diff --check` also passed. The
production Linux executable builds; Windows/macOS, installer packaging and future
acquisition/native import commands remain outside this verification.

## Cache extraction review regressions (2026-09-26)

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

## Selected Windows cache foundations (2026-09-25)

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
[research](../games/hsr/api-research.md#initial-source-reader-increment-2026-09-25).

## Unit-first backend testing (2026-09-25)

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


## Current-user discovery (2026-09-26)

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
