# Testing and coverage

[CONTRIBUTING](../../CONTRIBUTING.md) sets the rules: test-driven development and
exactly 100% coverage of first-party code, enforced per file. This file explains
how the gates enforce them. Commands are listed in [DEVELOPMENT](DEVELOPMENT.md).

## The check

`npm run check` is the authoritative gate, locally and in CI, and stops at the
first failed stage: formatting and lint, the frontend build, fresh coverage
reports, the mutation probes with a final full test and coverage run, report
validation, Rust formatting and Clippy. The final run includes the backend
integration tests and the native end-to-end tests in a network namespace with
no external route (`test:offline`).

## Coverage by source

| Source | Instrumentation | Required per file |
| --- | --- | --- |
| `src-ui/src/**/*.{ts,vue}`, `src-ui/build/**/*.ts` | Vitest V8, the frontend's own run, to `coverage/frontend/` | Lines, statements, functions, branches: 100% |
| `tooling/**/*.ts` | Vitest V8, the root `tooling` project, to `coverage/tooling/` | Lines, statements, functions, branches: 100% |
| `src-tauri/src/**/*.rs` except the delegates below | cargo-llvm-cov, **unit tests only**, to `coverage/backend-unit/` | Lines, regions, functions, branches: 100% |
| `src-tauri/src/main.rs`, `src-tauri/src/bin/roll-tracker-mock.rs`, `src-tauri/build.rs` | Native boundary coverage, to `coverage/backend/` | Lines, regions, functions, branches: 100% |
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

## Backend stages

Backend coverage comes from unit tests alone, recorded before anything else runs,
so integration tests can never fill a unit gap. The stages, composed by
`test:backend` and isolated by `test:offline`:

1. `coverage:backend-unit` resets counters, runs `cargo test --lib` and freezes
   the unit report.
2. `test:backend-integration` runs the Cargo integration tests (real files,
   SQLite and processes).
3. `test:e2e-smoke` builds and runs the desktop end-to-end tests.
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
synthetic HoYoverse. Apps close as a user would, and the test waits for that
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
source briefly and restores it in `finally`; a suite-level hook then regenerates
every report once, even after a failure. A probe command that does not fail as
expected saves a snapshot to `test-results/probe-failures/`.

Run the check serially, never alongside edits, coverage runs or native builds,
and never stage changes while it runs. After an interrupted run, inspect
`src-ui/src/coverage-probe.ts`, `src-tauri/src/coverage_probe.rs`,
`src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`,
`src-tauri/tests/*_probe.rs` and report backup files before resuming.
`test:probes` needs the bundled frontend, so run `npm run build` first when
running it alone.

## Network policy in tests

Automated tests are local and self-contained: scripted transports, the mock
debug binary and synthetic fixtures, covering success, pagination, errors and
cancellation. No test contacts HoYoverse or uses player credentials, and the
native tests refuse to start outside the network namespace. The offline run
checks local behaviour; it is not a product requirement, since acquisition on
request is in scope ([decision 0002](../architecture/decisions/0002-user-requested-history-acquisition.md)).

## CI

`.github/workflows/check.yml` installs the pinned toolchains and tools, runs
`npm run check`, then builds the release binary, uploading reports and
screenshots even on failure. **Tests and 100% coverage** is the required check
on protected `main`.

CI caches npm downloads, Cargo dependencies and their builds, and installed Cargo
tools; reports are always generated afresh, and every probe and gate runs on
every invocation. Two details matter:

- asdf keeps Cargo's home inside the toolchain, so CI exports it as `CARGO_HOME`
  before the cache step; otherwise tools are rebuilt every run.
- The pinned nightly uses Cargo's new build-dir layout, which rust-cache before
  v2.9.2 prunes badly; keep v2.9.2 or later.

Compare cold and warm hosted runs before claiming a speedup.
