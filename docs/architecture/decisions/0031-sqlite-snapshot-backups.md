# 0031 — SQLite snapshot backups

Date: 2026-10-16
Status: Accepted

## Context

1.0.0 keeps all history in one SQLite file, `history.sqlite`, whose schema is
versioned and whose upgrades are tested against frozen databases released
versions wrote ([decision 0029](0029-automated-release-verification.md)). Players
need a backup they can keep and restore into a fresh profile, preserving records,
source identity and metadata ([product brief](../../product/PROJECT.md)). UIGF, the
community interchange format, cannot hold the app's own data: servers, time-zone
evidence and each import's provenance.

## Decision

- **A backup is a snapshot of the database.** A consistent copy of
  `history.sqlite`, written with SQLite's `VACUUM INTO`, holding every account,
  roll and import exactly. Its schema version is its format version; no second
  format is kept in step with the schema. Moving data to other tools and reading
  it is UIGF export's job ([0055](../../product/features/0055-uigf-export.md)).
- **Restoring replaces the history.** After a confirmation naming what is
  replaced, the backup takes the current database's place, and the current
  database is first kept as a dated safety copy in the data folder. Merging
  histories is what file import is for.
- **A backup file is untrusted input.** Before anything changes, restore checks a
  copy: its size, that it is a SQLite database with the app's application ID, a
  schema version no newer than the app's, a passing integrity check and exactly
  the schema of its version. It then migrates the copy to the current schema, so
  a backup from any release restores.
- **Migrations keep the database they upgrade.** Before upgrading an older
  database on opening, the app keeps a copy of it in the data folder, and a failed
  migration leaves the original unchanged. (Amended 2026-10-21:) the copy is
  `history-v<N>-YYYYMMDD-HHMMSS.sqlite`, named from the native local time and
  claimed new, so a later upgrade of a restored older backup never replaces an
  earlier copy; all pending migrations run in the one transaction that opens the
  database; and a failed upgrade is remembered until the app restarts, so each
  failure keeps one copy, while the app refuses to use the history.
- **Backups stay out of the data folder.** (Amended 2026-10-17:) a backup, a
  restore's source and its safety copy are never placed where they could
  replace the live database or its journal. (Amended 2026-10-18:) a restore's
  source is refused only when it is the history itself, `history.sqlite`, so a
  safety copy can be restored from the data folder.
- **The webview never names paths.** Backup and restore choose their files through
  dialogs that the Rust side opens, so no command takes a filesystem path from the
  webview.

## Alternatives and consequences

- **An app-specific JSON envelope:** readable and parsed with strict limits, but a
  second format to version beside the schema for as long as backups are kept.
- **UIGF as the backup:** loses servers, time-zone evidence and provenance.
- **Restore that merges:** never discards history, but provenance from two
  databases would need reconciling, and a restore would no longer give back what
  was backed up.
- A backup is not readable outside the app; the safety copies take space in the
  data folder until the user removes them.
