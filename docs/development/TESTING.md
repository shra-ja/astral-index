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
