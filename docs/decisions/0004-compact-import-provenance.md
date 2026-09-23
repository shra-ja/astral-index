# 0004 — Compact provenance for overlapping imports

Status: accepted for milestone 2, 2026-09-23. Supersedes the snapshot and repeated
association policy in [decision 0003](0003-sqlite-import-foundations.md).

Repeatedly importing the last 12 months is the baseline workload. Store each
scoped roll once, with its exact payload and a required first-import batch
reference. A composite foreign key prevents provenance from pointing at another
game, UID or server. Successful batches store time, game/UID/server, adapter,
and inserted/duplicate/conflict counts. Conflicts still reject the entire
transaction; therefore persisted successful summaries have zero conflicts.
Rejected previews and failed imports leave no durable batch or diagnostic log.

Do not retain full response snapshots, repeated roll associations or source
credentials. Per-roll fields and unknown extensions remain preserved. Page-only
extensions and original page ordering are not stored. Import summaries cannot
reconstruct a historical input, its duplicate occurrences or its original page
context. They also do not establish complete history. Account timezone evidence
remains optional and source-local timestamp strings are unchanged.

The app is unreleased, so schema compatibility with earlier development builds
is not required. `001_initial.sql` creates the compact schema directly; there is
no legacy schema or upgrade chain. Keep the header marker at 2 solely to distinguish
this layout from obsolete version-1 development databases. Opening an obsolete
schema returns `Schema` without changing its bytes. Developers must explicitly
recreate incompatible development databases; the service never deletes them.
No local database is removed as part of this source change.

Initialization remains transactional and only accepts empty, unclaimed databases.
Reopening the current schema leaves identity, revision and data unchanged.
Unsupported versions, unrelated content and initialization failures retain their
existing rejection/rollback guarantees. After release, persistent schema changes
will require versioned migrations and preservation/recovery tests.

Preview keeps canonical roll payloads, without a second full-page copy. Both
preview and commit use one prepared identity lookup per classification pass.
Commit reclassifies under the write lock, inserts only newly seen records using
one prepared insert, and records one summary. Fully overlapping imports perform
no roll inserts. Comparison still reads complete payloads to detect conflicts;
CPU/read work scales with incoming records, while durable growth scales with new
records and batches. Same-batch repeats remain counted and conflict checked.

Revision checks, immutable preview ownership, account isolation, timezone checks,
and atomic rollback remain mandatory. No hash-only equality, background fetching,
new dependency or UI capability is introduced. See [testing](../TESTING.md) for
synthetic workload measurements and their limits.
