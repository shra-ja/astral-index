# Testing and coverage

[CONTRIBUTING](../../CONTRIBUTING.md) sets the rules: test-driven development and
exactly 100% coverage of first-party code, enforced per file. This file explains
how the gates enforce them. Commands are listed in [DEVELOPMENT](DEVELOPMENT.md).

## The check

`npm run check` is the authoritative gate and stops at the first failed stage.
It runs three parts in turn, which CI runs as separate jobs under the same
names:

1. `check:static`: formatting and lint (Markdown included), the docs, icon and
   version checks, the frontend bundle, Rust formatting and Clippy, which
   compiles the unit tests and so needs the bundle.
2. `check:gates`: the build, fresh frontend and tooling coverage, the backend
   unit, integration and native end-to-end tests in a network namespace with no
   external route (`test:offline`), and report validation.
3. `check:probes`: the build, then the mutation probes.

The gates come before the probes because a change is far likelier to fail them.

## Coverage by source

| Source | Instrumentation | Required per file |
| --- | --- | --- |
| `src-ui/src/**/*.{ts,vue}`, `src-ui/build/**/*.ts` | Vitest V8, the frontend's own run, to `coverage/frontend/` | Lines, statements, functions, branches: 100% |
| `tooling/**/*.ts` | Vitest V8, the root `tooling` project, to `coverage/tooling/` | Lines, statements, functions, branches: 100% |
| `src-tauri/src/**/*.rs` except the delegates below | cargo-llvm-cov, **unit tests only**, to `coverage/backend-unit/` | Lines, regions, functions, branches: 100% |
| `src-tauri/src/main.rs`, `src-tauri/src/bin/astral-index-mock.rs`, `src-tauri/build.rs` | Native boundary coverage, to `coverage/backend/` | Lines, regions, functions, branches: 100% |
| `src-ui/vite.config.ts`, `src-ui/eslint.config.ts`, `vitest.config.ts`, `eslint.config.ts` | None: Vitest always excludes config files | Not measurable; each only delegates to a module covered above |

The delegates in the last two rows are the only exceptions, and
`tests/coverage-reports.test.ts` pins their bodies: adding logic to any of them
fails the gate ([why](../../CONTRIBUTING.md#coverage-is-a-blocking-gate)). LLVM
measures regions rather than statements. Macro-generated mappings stay in the
report.

## Report gates

- `tooling/coverage.ts` compares integer covered and total counts, so a rounded
  percentage cannot pass; it is itself covered at 100%.
- `tests/coverage-reports.test.ts` inventories source files independently of
  execution and rejects missing, empty, incomplete or stale reports. A new
  executable file outside the instrumented directories fails until it is
  instrumented; Rust source never compiled into a module fails too.
- Each run clears its report directory and Rust counters and rebuilds first-party
  Rust, `build.rs` included.
- Exclusions are limited to test code and fixtures (sibling `*.test.ts`,
  `src-ui/tests/`, `src-tauri/tests/`, root `tests/` and `src-tauri/src/**/tests/`
  doubles compiled only under `cfg(test)`), dependencies and generated output
  (`node_modules/`, `src-tauri/target/`, `src-tauri/gen/`, `src-ui/dist/`,
  `coverage/`), and files with no TypeScript or Rust control flow (HTML, CSS,
  images, Markdown, lockfiles, declarative JSON, YAML and TOML). There are no
  coverage-ignore annotations.

## Frontend test clock

`src-ui/tests/setup.ts` runs before every frontend test file and keeps
`Date.now` from running backwards. Vue Test Utils' `trigger` stamps each event
with `Date.now() + 1`, and Vue drops an event stamped no later than the moment
its handler was attached. A wall clock that steps back between mounting and a
`trigger`, as WSL's did every 30 seconds on some boots, therefore lost clicks
and key presses at random.
`src-ui/tests/monotonic-clock.test.ts` steps the clock back after mounting and
checks that a click still lands.

## Backend stages

Backend coverage comes from unit tests alone, recorded before anything else runs,
so integration tests can never fill a unit gap. The stages, composed by
`test:backend` and isolated by `test:offline`:

1. `coverage:backend-unit` resets counters, runs `cargo test --lib` and freezes
   the unit report.
2. `test:backend-integration` runs the Cargo integration tests (real files,
   SQLite and processes).
3. `test:e2e-smoke` builds and runs the desktop end-to-end tests, on a
   2560×1600 virtual screen so they can open very wide windows.
4. `coverage:backend-report` renders the combined report for the delegates.

Rendering never executes tests and cannot establish freshness on its own. The
shared tooling is in `tooling/backend-coverage.ts`, covered like other tooling.

## End-to-end tests

`tests/e2e-smoke.test.ts` drives the real instrumented app through tauri-driver
and WebDriver under Xvfb (X11 even on Wayland hosts), described in
[tests/README.md](../../tests/README.md). The shell test checks bundled assets,
keyboard operation, the window minimum, the command capability and that the CSP
blocks webview connections. The mock debug binary
([decision 0014](../architecture/decisions/0014-mock-debug-binary.md)) runs
retrieval, review, saving, restarts, failures and account scenarios against a
synthetic HoYoverse. A width sweep narrows the History screen from 1700px to the
480px minimum in 10px steps, checking that the sidebar gives way before the
content, that no compact layout returns as the window narrows, that no list
column is cut off, that the toolbar's controls stay 32px tall and in their
groups, and that the pager keeps its pages centred and on one line while its
label shows; at two widths it then steps through pages, checking that no page
button moves. A second sweep checks that the review's figures keep each label on
one line and each figure whole. Every screen and step passes an axe-core audit
of WCAG 2.2 A and AA and best-practice rules, a 20,000-roll history saves and
browses within measured time bounds, and the About dialog's views load nothing
the CSP blocks ([decision 0028](../architecture/decisions/0028-release-checks.md)).
Apps close as a user would, and the test waits for that
process's coverage profile; a killed process never counts as covered.
Screenshots go to `test-results/`.

Bubblewrap provides the network namespace; only loopback exists, for WebDriver.
Ubuntu's hosted runners restrict unprivileged user namespaces, so CI loads a
narrow AppArmor profile for a CI-only copy of `bwrap` instead of lifting the
restriction. The preflight must pass: the test never skips or falls back to
running online.

## Mutation probes

`tests/mutation-probes.test.ts` proves each gate fails when it should: an
unexecuted TypeScript file and branch, an uncovered Rust branch, an uncompiled Rust
file, stale, missing and incomplete reports, integration coverage standing in for
unit coverage, a permissive CSP, and logic added to a delegate. Each probe changes
source briefly and restores it in `finally`. Every command the probes run writes
its reports, screenshots and other results to `test-results/probe-run/` instead
of `coverage/` and `test-results/`: the probe file sets `ASTRAL_INDEX_PROBE_RUN=1`,
which `tooling/outputs.ts` and the frontend's Vite configuration follow. The
probes make a fresh baseline there first, and a last test checks that
`coverage/` is exactly as the gates left it, so the probes run alone at any time
and leave nothing to clean up. Restoring a source file gives it a new
modification time, so after the probes, `coverage:verify` alone reports the
gates' reports as stale until `check:gates` runs again; restoring the old time
would let Cargo reuse binaries built from the mutated source. The native
coverage and CSP probes run only the end-to-end shell test (`test:e2e-probe`),
which launches the real app and holds the CSP assertion; the full suite runs in
the gates. Each
probe command runs for at most 10
minutes under coreutils `timeout`, which stops its whole process group, so a
stalled native run fails well within CI's 30-minute job (`tooling/probe-run.ts`).
A probe command that does not end as expected, or runs out of time, saves a
snapshot to `test-results/probe-failures/`.

Run the check serially, never alongside edits, coverage runs or native builds,
and never stage changes while it runs. After an interrupted run, inspect
`src-ui/src/coverage-probe.ts`, `src-tauri/src/coverage_probe.rs`,
`src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`,
`src-tauri/tests/*_probe.rs` and report backup files before resuming.
`test:probes` needs the bundled frontend: `npm run check:probes` builds it
first.

## Docs checks

Agents find their way through the docs by links from `AGENTS.md`, so the docs are
checked like code ([decision 0016](../architecture/decisions/0016-markdown-checks.md)):

- `npm run docs:check` runs `tests/docs.test.ts`, which applies
  `tooling/docs.ts` to every tracked or new Markdown file and the Rust doc
  comments: relative links and `#anchor`s must resolve, every Markdown file must
  be reachable by links from `AGENTS.md` (the README and agent skills are
  allowlisted), and STATUS
  must stay within 150 lines. A mutation probe proves it fails.
- markdownlint, in `lint` and `lint:check`, checks structure: heading levels,
  unique headings, code block languages, dash lists and compact tables. Prose
  keeps its hand wrapping; nothing reflows it. Archived status history, decision
  records and agent skills are skipped.

## Icon check

The app icons in `src-tauri/icons/` are generated from the brand's emblems in
`src-ui/src/assets/brand/` ([decision 0023](../architecture/decisions/0023-astral-brand.md)).
`npm run icons:check` runs `tests/app-icons.test.ts`, which renders them afresh
with `tooling/app-icons.ts` and fails, naming each file, when a committed icon
differs or is missing; `npm run icons` writes them. A mutation probe proves the
check fails.

## Third-party notices

Every build generates the third-party notices
([decision 0025](../architecture/decisions/0025-third-party-notices.md)):
`npm run build` first runs `npm run notices`, which runs `tests/notices.test.ts`.
It gathers the crates with cargo-about (offline), the npm packages from a
production bundle and the typeface's package, writes the gitignored
`src-ui/src/assets/third-party-notices.json` and `THIRD-PARTY-NOTICES`, and fails,
failing the build, when a component has no licence text or a licence is outside
`src-tauri/about.toml`'s accepted list. A mutation probe proves it fails.

## Version check

The About dialog shows the version the native side reports, which comes from
`src-tauri/tauri.conf.json`. `npm run versions:check` runs
`tests/versions.test.ts`, which fails, naming each file and its version, when
`package.json`, `src-ui/package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json` disagree or one declares none. A mutation probe
proves it fails.

## Network policy in tests

Automated tests are local and self-contained: scripted transports, the mock
debug binary and synthetic fixtures, covering success, pagination, errors and
cancellation. No test contacts HoYoverse or uses player credentials, and the
native tests refuse to start outside the network namespace. The offline run
checks local behaviour; it is not a product requirement, since acquisition on
request is in scope ([decision 0002](../architecture/decisions/0002-user-requested-history-acquisition.md)).

## CI

`.github/workflows/check.yml` runs five jobs in parallel on every pull request
and push to `main`, then publishes the Windows build. The five should be
required checks on protected `main`:

| Job | Runs on | Does |
| --- | --- | --- |
| **Format, lint, docs and Rust lints** | `ubuntu-24.04` | `npm run check:static` |
| **Tests and 100% coverage** | `ubuntu-24.04` | `npm run check:gates`, uploading reports and screenshots even on failure |
| **Mutation probes** | `ubuntu-24.04` | `npm run check:probes`, uploading any failure snapshot |
| **Windows unit tests** | `windows-2025` | The frontend bundle, then the Rust unit tests |
| **Windows release build** | `windows-2025` | The release executable, kept for a day as `windows-build-unverified-<commit>` |
| **Publish the Windows build** | `ubuntu-24.04` | After the five: republishes a passing run's build, or deletes it |

The Linux jobs share their setup through `.github/actions/setup-linux`, and the
Windows jobs through `.github/actions/setup-windows`; the tool versions live
there. Static checks don't depend on the OS, so they run once, on Linux. Windows
runs because the first release ships for Windows only
([decision 0027](../architecture/decisions/0027-windows-first-release.md)): it
measures no coverage, and the offline sandbox and native end-to-end tests stay
Linux-only. The release build runs in parallel with the checks, so an
executable exists only once every check has passed: the build waits as
`windows-build-unverified-<commit>`, and the publish job, the only one allowed
to delete artifacts, republishes it as `astral-index-dev-build-unsigned-<commit>`
for 30 days when all five jobs pass, or deletes it when any fails or the run is
cancelled. While a run is in progress, the unverified build can briefly be
downloaded under that name. Only this repository's builds are kept, not those
of fork pull requests. The published build is a development build, unsigned and
not a release. Linux, not a release OS, builds no release.
`tooling/ci.test.ts` checks the jobs, the setup actions and the scripts they run.

Each Linux job ends by writing one summary for its run, even after a failure
(`npm run ci:summary`, from `tooling/job-summary.ts`): its name and result, what
it ran and, for the gates, each coverage report's totals. Vitest's own job
summaries are off in both Vitest configurations, since every Vitest run would
add an untitled one, the probes' deliberately failing runs included; its
failure annotations stay.

CI caches npm downloads, Cargo dependencies and their builds, and installed Cargo
tools; reports are always generated afresh, and every probe and gate runs on
every invocation. Some details matter:

- Only `main` saves caches; pull requests restore `main`'s. GitHub keeps up to
  10 GB of caches per repository and a pull request's caches serve no other
  branch, so saving them would evict `main`'s. The gates and probes jobs build
  the same instrumented binaries and share one Rust cache.
- `cargo-llvm-cov` and `cargo-about` install as prebuilt, checksummed releases
  through `taiki-e/install-action`; `tauri-driver`, which has none, compiles once
  and is cached. Locally, DEVELOPMENT installs all three with `cargo install`.
- asdf keeps Cargo's home inside the toolchain, so CI exports it as `CARGO_HOME`
  before the cache step; otherwise tools are rebuilt every run.
- The pinned nightly uses Cargo's new build-dir layout, which rust-cache before
  v2.9.2 prunes badly; keep v2.9.2 or later.
- Every action is pinned to a commit, and updated by hand to releases at least
  two weeks old.

Compare cold and warm hosted runs before claiming a speedup.

Code that differs on Windows is chosen with `#[cfg(windows)]`, and its tests
state each platform's expectation the same way: the app's origin
(`http://tauri.localhost` there), its data folder's name, WebView2's own profile
folder. Build expected paths with `Path::join` rather than `/`. Windows refuses
to start a binary without the Common Controls manifest (`0xC0000139`), and
Tauri's resource, which holds it, links into the app's binaries alone, so
`build.rs` has the linker embed `windows-app-manifest.xml` in every Windows
binary, tests included, instead. The window icon also comes from that resource
on Windows, so its test runs elsewhere and the release checklist checks it. The registration tests
resolve the machine's real local data folder, so a Windows run leaves empty
`Astral-Index` and `Astral-Index-Mock` folders there.
