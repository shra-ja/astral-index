# 0056 — Star Rail Station import

Status: Planned · Milestone 12, Genshin Impact and the banner catalogue

Import a Star Rail Station backup, so players can move their history from it, as
another file source on the Import screen. It needs item names and types, which
Star Rail Station's files lack, so it follows the banner catalogue's item
metadata ([0034](0034-banner-metadata.md)). It stays local and never makes a
network request.

## Requirements

- **Source:** Star Rail Station's backup file (`.dat`), format version 2
  ([file research](../../games/hsr/file-research.md)): the `srs` header and
  lz-string-compressed JSON, decompressed within a size bound. Other versions are
  refused, so a format change shows as an error rather than missing rolls. Its
  CSV and XLSX exports are not read: both leave out the collaboration warps.
- **Profiles:** a backup holding more than one Star Rail Station profile asks
  which to import.
- **Account:** the backup names no game account, so the user picks a saved
  account or enters a UID; the server and its offset come from the game's UID
  rule ([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
- **Records:** the roll ID from `uid`, the item, pool, category and rarity from
  the file, the server's local time from the UTC timestamp and the server's
  offset, and the name and item type from the catalogue's item metadata. A roll
  whose item the catalogue does not know blocks the import, saying how many.
  Star Rail Station's own pity and outcome fields are not imported: the app
  calculates its own.
- **Manual entries:** rolls Star Rail Station marks as manual, added by hand and
  possibly with IDs it made up, are left out, and the review says how many and
  why.
- Duplicates, conflicts, the review and saving follow file import's rules
  ([0030](0030-history-file-import.md)).

## Tasks

- [ ] **Backup reading.** Decompression, version and structure checks, and
  synthetic fixtures modelled on the researched structure.
- [ ] **Normalisation.** Account choice, times, catalogue lookups and refusals.
- [ ] **Import screen.** The source, the profile and account choice, and the
  review.
