# Storage

Status: implemented for Honkai: Star Rail API imports; the coverage and game
metadata entities are tentative. See decisions
[0003](decisions/0003-sqlite-import-foundations.md),
[0004](decisions/0004-compact-import-provenance.md),
[0009](decisions/0009-local-database-location.md) and
[0010](decisions/0010-portable-mode.md), and the
[pre-release schema policy](../../CONTRIBUTING.md#pre-release-database-schemas).

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

- **History page:** one page of a category for one account, newest first by
  server time then numeric roll ID, each roll numbered by its position
  in the category (1 is the oldest stored), plus every category's count and a
  summary of the whole category: its 5★ and 4★ counts and the server times of
  its oldest and newest rolls.
- **Accounts:** the game's saved accounts with each one's roll count, the one
  imported into most recently first; the account imported last; and one account
  by UID and server, so a history read names only saved accounts.
- **Last import:** the newest batch summary of the game.
- **Saved roll IDs:** the game's IDs grouped by account, for the quick refresh's
  stop check.

## Not yet designed

Backups need their own versioned format and validation. A database is never
overwritten until a replacement is validated; recovery behavior is defined before
restore or destructive migrations are implemented. After the first release,
schema changes use versioned migrations with data-preservation tests.
