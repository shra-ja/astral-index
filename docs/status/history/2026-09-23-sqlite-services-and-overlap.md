# 2026-09-23: SQLite services and overlap measurements (archived 2026-10-04)

Archived from living docs. Statements and “Next” items below describe their
historical context, not current priorities.

## From TESTING.md

### SQLite service tests and failure injection

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

`src-tauri/tests/storage.rs` uses real temporary database files for restart, overlapping
and repeated imports, conflicts, account/server/game isolation, unknown timezone,
source ownership, cancellation before commit, unsupported/corrupt databases,
constraints, concurrent writers, and insert/final-commit rollback. The tests do
not read player files or call external endpoints.

The `tests` module in `src-tauri/src/storage.rs` uses a strict scripted SQLite API
double. Unit tests verify queries, account/data bindings, transaction sequencing,
commit and rollback requests, safe error propagation and core import rules without
opening SQLite. These replace the earlier direct-SQLite private fault-injection
suite. Real-file integration tests still verify SQLite rollback, constraints,
persistence and corruption handling against the production bindings.

The initial coverage run rejected uncovered error-propagation regions despite
100% measured branch outcomes. Failure injection covers those regions; no
thresholds, source inventory or exclusions were relaxed. JSON values use built-in
string/map/array serialization without unreachable custom serialization-error
branches. Malformed stored JSON still returns a safe, tested decoding error.
The migration SQL is a declarative schema included by the instrumented Rust
initializer; tests exercise its constraints, header version, successful creation,
rollback of partially applied DDL, and reopen behavior.

### Overlapping imports and schema 2 (2026-09-23)

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
