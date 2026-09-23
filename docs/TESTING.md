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

| Source | Instrumentation | Mandatory per-file metrics |
| --- | --- | --- |
| `src/**/*.ts` | Vitest V8 | Lines, statements, functions, branches: 100% |
| `scripts/**/*.ts` | Vitest V8 | Lines, statements, functions, branches: 100% |
| `src-tauri/src/**/*.rs`, `src-tauri/build.rs` | cargo-llvm-cov with nightly branch instrumentation | Lines, regions, functions, branches: 100% |

LLVM uses executable regions rather than a distinct Rust statement metric. Zero
branch points means there are no branches to cover; startup has no handwritten
conditionals, while the HSR parser has measured validation branches. An automated probe adds an actual conditional and
verifies LLVM reports a missed branch before restoring the source. Macro-generated
mappings remain in the report; handwritten native glue is not excluded.

`scripts/coverage.ts` compares integer covered/total counts, so rounded percentages
cannot pass. The validator itself has 100% coverage. `scripts/tests/reports.test.ts`
inventories source independently of execution and rejects absent, empty or stale
reports. New executable files outside the instrumented directories fail the
inventory check until instrumentation is added. V8 includes unexecuted files; the
inventory also catches Rust source never compiled into a module. Each run clears
its own report directory and Rust counters and rebuilds first-party Rust,
including `build.rs`.

Exclusions are limited to:

- `src/tests/`, `src-tauri/tests/`, `scripts/tests/`, and root `tests/`:
  test code, test helpers and synthetic fixtures only. Frontend/tooling coverage
  and source inventories explicitly exclude those test directories; production
  source globs and per-file thresholds are unchanged.
- `node_modules/`, Cargo dependencies and `src-tauri/target/`: third-party or generated artifacts.
- `src-tauri/gen/`, `dist/`, `coverage/`: mechanically generated output.
- HTML, CSS, SVG/PNG, Markdown, lockfiles and declarative JSON/YAML/TOML: no
  instrumentable TypeScript/Rust control flow. They are exercised by native smoke
  tests, builds and schema checks as applicable.

There are no coverage-ignore annotations or handwritten-source exclusions.
Workflow steps and npm scripts compose tool commands; the custom executable gate
is TypeScript and is instrumented.

## Red-green evidence for milestone 1

On `feat/offline-shell`, based on authorized documentation baseline `2d78399`:

1. UI tests ran against a one-line placeholder and failed on the absent heading
   and game selector. The empty state and selection handler made both pass.
2. Coverage-validator tests ran against a no-op: 14 failed because missing or
   invalid coverage was accepted. The implementation then passed all 15 tests
   with full branch coverage.
3. The native test ran against an empty Rust `main`; session creation timed out
   because no window existed. The Tauri event loop made native assertions pass.
   Harness fixes then ensured a graceful real app exit and coverage from that
   process, rather than accepting a killed process as success.
4. Automated probes introduce an unexecuted TypeScript file/branch, an uncovered
   Rust branch, an uncompiled Rust source file, and missing/incomplete reports.
   Each must fail the real gate, then restore source and regenerate clean reports.

Milestone 1 had no Rust domain logic. Native integration covers startup and the
build script; the milestone 2 response tests below now run in the same harness.

## CI and handoff

`.github/workflows/check.yml` installs pinned asdf toolchains and coverage tools,
runs `npm run check`, then builds the production native binary. It uploads
HTML/JSON reports and the native screenshot, including on failures. The required
job is **Tests and 100% coverage**. Configure that status in branch protection
after the first hosted run; local success does not prove remote CI ran.

Do not run probes concurrently with editing, coverage or native builds. They
mutate source briefly and restore it in `finally` blocks. After interruption,
inspect `src/coverage-probe.ts`, `src-tauri/src/coverage_probe.rs`,
`src-tauri/src/main.rs`, and report backup files before resuming.

## Connectivity scope after decision 0002

The `test:offline` command verifies local shell behavior in an isolated network
namespace; it does not impose an offline-only product requirement. The webview's
external-fetch rejection remains intentional. Future user-requested HoYoverse
acquisition runs through a native client. All automated tests must remain local
and self-contained, with appropriate HTTP mocks or isolated local test servers
and synthetic responses. No live HoYoverse requests or player credentials are
allowed in tests. Add coverage for
pagination, errors, cancellation, and absence of unrequested fetching. See
[decision 0002](decisions/0002-user-requested-history-acquisition.md).

## HSR response foundation TDD

On `feat/hsr-response-foundations`, the first seven integration tests failed
against a compiling parser placeholder returning `InvalidResponse`: valid pages,
empty pages, API codes, validation categories and size bounds were absent.
The parser implementation made all seven pass. Two additional tests then failed
on discarded unknown fields and an API error without `data`; preserving page/roll
extras and defaulting absent envelope data made both pass. A scripted mock source
adds overlap and terminal-success/error scenarios, for ten passing Rust tests.
A preliminary missing serialization-trait compile error was corrected before
observing the unknown-field assertion failure; it is not counted as red evidence.

Run `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test hsr`
for focused tests. `npm run check` runs these under LLVM instrumentation alongside
native startup and unchanged coverage failure probes. Fixtures and mocks have
no credentials or network access. They test parser policy, not live compatibility,
HTTP transport, automatic cursor progression, persistence, or complete history.

## SQLite service tests and failure injection

The storage increment began with a compiling no-op service. Eight tests failed
on absent preview counts, persistence, isolation, validation, schema protection
and stale-preview behavior. The implementation made them pass; the rollback
scenario then reached its real insert-failure assertions. A subsequent regression
test failed because a direct payload edit without a revision bump could pass
commit. Reclassification under the write transaction made it pass. A matching
regression for altered account timezone evidence then drove a shared context
check at preview and commit. Another test
failed on a system-generated import time, then passed with an explicit caller
Unix timestamp. No dependency, environment or compile failure counts as red.

`src-tauri/tests/storage/behavior.rs` uses real temporary database files for restart, overlapping
and repeated imports, conflicts, account/server/game isolation, unknown timezone,
source ownership, cancellation before commit, unsupported/corrupt databases,
constraints, concurrent writers, and insert/final-commit rollback. The tests do
not read player files or call external endpoints.

`src-tauri/tests/storage/failures.rs` uses SQLite's own authorizer and size limits to deny
specific database operations. It checks safe errors, complete rollback, unchanged
schema version and no lingering transaction. It is included only in the library's
test build so it can access the private connection initialization boundary;
the real-file storage suite is compiled in that same artifact to avoid splitting
normal and failure coverage across duplicate instantiations of the library;
rusqlite hooks/limits are dev-dependency features, not a production UI capability.
These tests supplement the real-file integration tests, not replace them.

The initial coverage run rejected uncovered error-propagation regions despite
100% measured branch outcomes. Failure injection covers those regions; no
thresholds, source inventory or exclusions were relaxed. JSON values use built-in
string/map/array serialization without unreachable custom serialization-error
branches. Malformed stored JSON still returns a safe, tested decoding error.
The migration SQL is a declarative schema included by the instrumented Rust
initializer; tests exercise its constraints, header version, successful creation,
rollback of partially applied DDL, and reopen behavior.

## Test layout refactor (2026-09-22)

Frontend tests now live in `src/tests/`; backend Rust tests and synthetic API
fixtures live in `src-tauri/tests/`. Cargo automatically discovers
`src-tauri/tests/hsr.rs` without a custom manifest target. Storage behavior and
failure tests live under `src-tauri/tests/storage/` and are included as test-only
library modules, preserving private connection access and a single storage test
artifact. Tooling tests are in `scripts/tests/`. Root `tests/` contains only the
application native end-to-end test and its X11 close-window helper.

This is a layout refactor: the baseline 17 frontend/tooling and 33 Rust tests
passed before moves. The same tests pass after moves; no application behavior or
test assertions changed. Coverage inventories and test-only exclusions follow
the new directories, with the same per-file thresholds and failure probes.

## Overlapping imports and schema 2 (2026-09-23)

Test-first evidence: the duplicate-write rejection test failed because a repeated
import attempted to insert existing rolls. Compact storage and inserting only
newly classified records made it pass. Existing conflict, isolation, ownership,
stale-preview and rollback tests remain in place.

The user subsequently authorized breaking pre-release schema changes. Tests first
failed because the initial SQL still created the old layout and the initializer
attempted to upgrade an obsolete schema rather than reject it. The sole initial
schema now creates compact storage directly. Tests verify unchanged bytes when
reopening it or rejecting an obsolete schema. The old upgrade implementation and
its compatibility tests were removed. Initialization failure injection still
verifies complete rollback, including partial DDL and final commit failures.
Malformed stored payload types return a safe error from both history and
classification. No source/coverage exclusions changed.

`rolling_year_imports_grow_with_unique_rolls_and_compact_summaries` creates 24
synthetic months of 500 rolls each. It imports the first 12 months (6,000 rolls),
repeats that window 24 times, then advances it monthly for 12 imports (500 new,
5,500 duplicates each). A final 500-record page contains one conflicting existing
ID and must leave the database byte-for-byte unchanged. Reopen yields 12,000
unique rolls, 37 successful summaries, 12,000 inserted and 210,000 duplicates.
Assertions bound duplicate-only file growth to 32 KiB, overall growth to twice
the initial file plus 64 KiB, and verify first provenance stays unchanged. Separate
tests verify snapshots/association tables are absent and reject any attempted
insertion of an existing roll, including a mixed new/duplicate import.

Run the workload with output:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib rolling_year_imports -- --nocapture --test-threads=1
```

For process peak RSS, first build without running, then time the emitted library
test executable directly (avoids measuring Cargo/compiler memory):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib --no-run --message-format=json > /tmp/overlap-artifacts.json
python3 - <<'PY'
import json, subprocess
for line in open('/tmp/overlap-artifacts.json'):
    artifact = json.loads(line)
    if (artifact.get('reason') == 'compiler-artifact'
            and artifact.get('executable') and artifact['target']['kind'] == ['lib']):
        subprocess.run(['/usr/bin/time', '-v', artifact['executable'],
            'storage::integration_tests::rolling_year_imports_grow_with_unique_rolls_and_compact_summaries',
            '--exact', '--nocapture', '--test-threads=1'], check=True)
PY
```

Timings include preview and commit against a real temporary SQLite file. RSS is
for the whole test process, including synthetic inputs and restart assertions,
not an allocation measurement of the importer alone. Timings/RSS are observations,
not CI speed thresholds or release-build guarantees. Storage assertions run in
the normal native coverage suite. Obsolete pre-release databases are rejected without modification; this change
does not automatically delete, migrate or vacuum them.

Measured on Ubuntu 24.04 x86_64, unoptimized test build, 2026-09-23, running the
workload alone: initial import **202 ms**; 24 complete repeats **4.143 s** total
(~173 ms/import); 12 rolling imports **2.062 s** total (~172 ms/import); rejected
conflicting page **12 ms**. The test reported **6.61 s** elapsed and maximum process RSS was
**26,376 KiB**. Database file sizes were **2,420,736 bytes** after initial import,
**2,420,736 bytes** after all complete repeats, and **4,808,704 bytes** after rolling
imports. Zero file growth in this repeat phase reflects space already available
in SQLite pages; summaries still consume space and will eventually grow the file.
No before/after throughput speedup or real-player performance claim is made.


After schema consolidation, `npm run check` passed: 37 Rust tests (21 storage
behavior, 6 storage failure, 10 parser), 17 frontend/tooling tests, native offline
integration and all three failure probes. Storage has 191/191 lines, 257/257
regions, 23/23 functions and 32/32 branch outcomes covered. Every other first-party
file also meets its required 100% metrics; formatting, TypeScript and Clippy pass.
