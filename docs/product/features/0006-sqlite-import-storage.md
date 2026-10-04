# 0006 — SQLite import storage

Status: Done · Milestone 2, HSR API import foundations
Decisions: [0003](../../decisions/0003-sqlite-import-foundations.md), [0004](../../decisions/0004-compact-import-provenance.md)

Local SQLite storage with immutable previews, transactional commits and compact
overlap handling.

## Tasks

- [x] Select and implement the local database, initial migration, and shared
  preview/transactional import services.
- [x] Verify persistence, repeat/overlap imports, validation failures, migration
  safety, and account isolation at the service level.
- [x] Optimize persistence for the baseline workload: repeatedly importing the
  last 12 months of history at varying points throughout the year, with substantial
  overlap. Keep each scoped roll once and retain compact import summaries with
  time, account/server, source/adapter, and new/duplicate/conflict counts.
- [x] Stop retaining full response snapshots by default. Replace per-import
  associations for unchanged rolls with first-import provenance; an entirely
  overlapping successful import should add only a compact summary, while an
  import with new rolls adds those rolls and their first-import provenance.
- [x] Preserve conflict validation for existing IDs, account/server isolation,
  immutable previews and atomic rollback under the compact storage model. Test
  schema initialization/rollback and rejection of obsolete development schemas.
  Document the deliberate lack of exact historical import reconstruction and
  the allowed pre-release compatibility break.
- [x] Add local synthetic performance and storage-growth tests for thousands of
  records across many rolling 12-month imports, including complete overlap,
  partial overlap, new records and conflicts. Record import time, peak memory
  and database growth; verify duplicate-only imports do not copy roll payloads
  or add per-roll associations again.

## Notes

The native service now uses SQLite/rusqlite with schema version 2, immutable
previews, exact-ID deduplication, conflict rejection and compact first-import provenance.
Real-file and injected-failure tests cover restart, isolation, stale previews and
rollback. The contract task is complete under the accepted assumptions; synthetic service
tests do not establish universal endpoint behaviour or prove lifetime retention.
See [decision 0003](../../decisions/0003-sqlite-import-foundations.md).
The sole initial schema creates compact storage directly, without page snapshots
or repeated associations. Obsolete pre-release schemas are rejected, not upgraded. See [decision 0004](../../decisions/0004-compact-import-provenance.md)
and the synthetic overlap measurements in [testing](../../TESTING.md#overlapping-imports-and-schema-2-2026-09-23).
