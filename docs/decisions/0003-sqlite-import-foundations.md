# 0003 — SQLite storage and reviewed imports

Status: accepted for the milestone 2 backend increment, 2026-09-22.

Use SQLite through exactly pinned `rusqlite` 0.40.2 with bundled SQLite. This
keeps the database local and avoids dependence on the host SQLite version.
The synchronous API fits short native service operations; the future Tauri
integration must run blocking work off the UI thread. No webview SQL plugin or
arbitrary database commands are exposed.

SQLite's [transaction rules](https://www.sqlite.org/lang_transaction.html) and
rusqlite's [transaction API](https://docs.rs/rusqlite/0.40.2/rusqlite/struct.Transaction.html)
support acquiring the write transaction before checking a reviewed import.
An unfinished transaction rolls back when dropped. Use this for both schema
creation and import; retain normal durable SQLite settings.

The schema has an application identifier and an independent schema version,
using SQLite's [header pragmas](https://www.sqlite.org/pragma.html). Initialize
only an empty, unclaimed version-zero database. Refuse unrelated or unsupported
versions; no destructive repair or downgrade is attempted. Future migrations
must add their own test-first recovery and compatibility evidence.

Identity is `(game, UID, resolved server, source roll ID)`, with text columns and
SQLite uniqueness constraints. Preserve roll fields and unknown extensions as
JSON alongside these indexed keys. Account timezone evidence remains optional;
conflicting evidence blocks import rather than silently reinterpreting timestamps.
Full validated page snapshots retain source ordering/context and batch provenance;
roll-to-batch associations include repeated occurrences. No historical completeness
is inferred. This is an internal schema, not a UIGF archive or complete backup.

An opaque preview owns its validated records, counts and database identity/revision.
Commit accepts that preview, never rereads the source, checks revision, account timezone evidence and record classifications under an
immediate transaction, and atomically writes accounts, rolls, batch provenance and
revision. Import time is a caller-supplied Unix timestamp in seconds;
the service never reads a system clock. A stale or cross-database preview must be regenerated. Payload differences
for one scoped ID are conflicts, including changed localized text: automatic
reconciliation is deferred. Identical reimports add provenance but no rolls.

The service takes a native path supplied by its caller; the shell is not connected
in this increment. Milestone 3 must choose the app-data path internally, resolve
account/server context, and expose narrow typed commands. History-file adapters,
backup/export and the second game remain separate work.
