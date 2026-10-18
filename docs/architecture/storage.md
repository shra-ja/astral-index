# Storage

Status: implemented for Honkai: Star Rail API imports; the coverage and game
metadata entities are tentative. See decisions
[0003](decisions/0003-sqlite-import-foundations.md),
[0004](decisions/0004-compact-import-provenance.md),
[0009](decisions/0009-local-database-location.md) and
[0010](decisions/0010-portable-mode.md), and the
[database schema policy](../../CONTRIBUTING.md#database-schemas).

## Location

One SQLite file, `history.sqlite`, through pinned `rusqlite` with bundled SQLite.
It lives in the app's local data folder (`%LOCALAPPDATA%\Astral-Index` on
Windows, never the roaming profile; `astral-index` in the XDG data folder on
Linux and WSL), or, when a `data` folder sits beside the executable, in that
folder (portable mode, which wins if both hold a database). The same folder holds
the webview profile. The path is resolved at setup but the file is created and
opened only on first use. `desktop::Database::run` runs SQLite work on Tokio's
blocking pool. Durable history never goes to browser storage or game folders.

## Model

| Entity | Holds | Status |
| --- | --- | --- |
| Account | Game, UID and server as text, time-zone evidence | Implemented |
| Roll | Game, account, source roll ID as text, the source record as JSON with its extensions, first batch | Implemented |
| Import batch | Adapter, import time, new, duplicate and conflict counts | Implemented |
| Metadata | Database identity and revision | Implemented |
| Coverage | Known history boundaries, gaps and source limitations per account and banner group | Tentative |
| Game metadata | Versioned item and banner mappings and verified rule sets | Tentative |

Identity is game, UID, server and the source roll ID, never a timestamp or a
localized name. Game IDs (`honkai-star-rail`, `genshin-impact`) are stable.
Timestamps keep their source text and time-zone evidence; an unknown time zone
stays unknown rather than being converted. Full response snapshots and per-import
associations for unchanged rolls are deliberately not kept (decision 0004).

## Import: preview, then commit

1. **Preview** (`Store::preview`): validates every page of a batch against the
   resolved account, server and time zone, then classifies each record as new,
   duplicate or conflict in a read transaction. The preview is immutable, owns
   its validated values and carries the `Review` DTO: account, counts overall
   and per category (all six, in fetch order), the server-local time range and
   each conflict's ID, category and time, but no payloads. Nothing is reread on
   commit.
2. **Commit** takes an immediate transaction, checks the database identity and
   revision, rechecks classifications and time-zone evidence, then writes the
   account, new rolls, the batch summary and the revision together. Any conflict
   blocks the whole batch. A successful import makes every outstanding preview
   stale. Any failure rolls everything back.

Repeating an import adds only a batch summary; overlapping imports add only new
rolls. Opening refuses unrelated, future or obsolete schemas without changing them.

## Reads

History reads never touch the network. They validate stored payloads and their
agreement with the indexed columns before returning anything, reporting damage
as a safe storage error rather than repairing it.

- **History page:** one page of a category for one account, of the rarities,
  item names and server days shown, newest first by server time then numeric
  roll ID, each roll numbered by its position
  in the category (1 is the oldest stored), plus every category's count and a
  summary of the whole category: its 5★ and 4★ counts and the server times of
  its oldest and newest rolls. One ordered pass in Rust reads each roll's ID,
  rarity, name and time, counts the 5★ and 4★ rolls and takes the period from
  the first and last before any filter applies, numbers each roll in the
  category and counts its pity, and keeps those the filter shows:
  names match by Unicode case folding, which SQLite's `lower()` and `LIKE` do
  not do beyond ASCII. Only the page's payloads are then read, by ID. On
  2026-10-06 a whole page read of 20,000 rolls in one category took about 48 ms
  with or without filters (about 0.26 s at 100,000), so no index was added: the
  pass reads the whole category either way.
- **Accounts:** the game's saved accounts with each one's roll count, the one
  imported into most recently first; the account imported last; and one account
  by UID and server, so a history read names only saved accounts.
- **Last import:** the newest batch summary of the game.
- **Saved roll IDs:** the game's IDs grouped by account, for the quick refresh's
  stop check.

## Released databases

1.0.0 released schema version 2. Its database, written by 1.0.0 from synthetic
history, is kept frozen in `src-tauri/tests/fixtures/storage/`, and
`src-tauri/tests/released_databases.rs` opens a copy and reads back every
account, import, roll and pity count
([decision 0029](decisions/0029-automated-release-verification.md)). Each
migration's tests open the same fixtures, and each release that changes the
schema adds its own.

## Backups

A backup is a snapshot of the database
([decision 0031](decisions/0031-sqlite-snapshot-backups.md)):
`Store::write_snapshot` writes one with `VACUUM INTO`, and `check_database`
checks a database file as restore will, as untrusted input. It refuses a file
over `MAX_DATABASE_BYTES` (256 MiB) before opening it, then opens it read-only in
SQLite's defensive mode, with `trusted_schema` off, no memory mapping, checked
cell sizes and lowered limits. The file must be a non-empty database with this
app's application ID and a released schema version no newer than the app's,
with exactly the schema its version's SQL creates, compared against a fresh
in-memory database built from that SQL before the integrity check runs the
file's schema. Each refusal is a distinct `Refusal`: too large, not a database,
another app's, newer, damaged or unreadable. `save_backup` refuses a target inside the data folder,
writes the snapshot to a temporary file it creates new beside the chosen one,
checks and flushes it, then renames it into place.

## Planned

Restore replaces the database after a checked copy is migrated, with the current
database kept as a safety copy; migrations keep a copy of the database they upgrade (decision 0031). Once a
migration exists, each version's expected schema is the one its migrations
produce from the first release's schema, not a fresh creation
([0037](../product/features/0037-backup-and-restore.md)). Imports will
compare a roll's facts rather than its whole record
([decision 0032](decisions/0032-history-file-import-rules.md)).

A derived UTC time per roll, from its record's local time and its account's
offset, joins the next schema migration another feature needs; it stays empty
where the offset is unknown. Records keep their source's local time.
