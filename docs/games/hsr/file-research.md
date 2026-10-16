# Honkai: Star Rail history files

Dated evidence about history files other tools write, behind the
[history-file import rules](../../architecture/decisions/0032-history-file-import-rules.md).
It comes from a player's own exports, inspected for structure only: no values
from them are recorded here or committed, and fixtures are synthetic.

## Files inspected (2026-10-16)

From one Europe account: StarDB's UIGF and native exports of 2026-07-23, and Star
Rail Station's backup and CSV of 2025-09-07 and of 2026-08-28, and an undated
XLSX. The files were compared with each other by roll ID.

- **Every source keeps HoYoverse's roll IDs.** Each ID has 19 digits whose first
  ten lie within an hour of the roll's Unix time, and every roll two sources
  share agrees on item ID, banner category and rarity, and on pool ID where both
  have one.
- **The Europe server's offset is a fixed +1 hour.** Local times differ from UTC
  times by exactly one hour in every calendar month, with no daylight saving,
  and the account's UID begins with 7.

## StarDB

- **UIGF export:** `info.version` `v4.1`, the UID as an integer, the time zone as
  an integer, `lang` `en-us`, and every record with `id`, `gacha_type`,
  `gacha_id`, `item_id`, `count`, `time` (server-local), `name`, `item_type` and
  `rank_type`, in all six categories. **`gacha_id` repeats the category code**
  (`"11"` for every Character Event roll) rather than giving the pool, as
  StarDB's export code writes the category for each category; UIGF defines the
  field as the pool ID.
- **Native export:** holds less: item IDs without names, rarities or pool IDs, UTC
  timestamps, and no collaboration warps. Its only addition is a per-roll flag
  for whether StarDB received the roll from HoYoverse itself.

## Star Rail Station

- **Backup (`.dat`):** the bytes `srs`, then JSON compressed with lz-string's
  `compressToUTF16`, written as UTF-8. The JSON has `version` `2` in both
  backups, a year apart. Rolls sit in `data.stores["<profile>_warp-v2"]` under
  `items_<category>` for all six categories, each with `uid` (the roll ID, a
  string), `itemId`, `gachaId` (the pool), `gachaType`, `rarity`, `timestamp`
  (UTC milliseconds), `manual`, and Star Rail Station's own pity and outcome
  fields. `profiles` names the Star Rail Station profiles, not game accounts:
  the backup has no game UID, server, time zone, item names or item types.
- **CSV:** columns `uid` (again the roll ID), `id` (the item ID), `rarity`, `time`
  (UTC, ISO 8601 with `Z`), `banner` (the pool), `type` (the category) and
  `manual`. **Both CSVs leave out every collaboration warp**, categories 21 and
  22, and otherwise match their backups roll for roll.
- **XLSX:** a sheet per category except the collaborations, with English item
  names, rarities as stars and times as localised text without a time zone; the
  roll and item IDs sit in a developer column.
- The newer backup holds every roll of the older backup and of both CSVs, with
  every field unchanged.

## Still to verify

- The first digit of the UID for servers other than Europe, and each server's
  offset, before the rule claims them: community observation gives 6 for
  America, 7 for Europe, 8 for Asia and 9 for Taiwan, Hong Kong and Macao.
- Whether manual entries in Star Rail Station carry HoYoverse's roll IDs; none of
  the inspected rolls were manual.
