# 0030 — History-file import

Status: Planned · Milestone 11, Backup, restore and file import

Import Honkai: Star Rail history from UIGF v4.0 to v4.2 files, as a second source
on the Import screen beside retrieval, through the same review and save steps
([imports](../../architecture/imports.md),
[decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
File import stays local and never makes a network request.

## Requirements

- **Choosing a file:** the user chooses a file; its size is bounded, sized for at
  least 100,000 rolls, and it must be UIGF with `info.version` from `v4.0` to
  `v4.2`. Other versions, legacy UIGF and SRGF are refused with what was found.
- **Sections:** every `hkrpg` account in the file is read; other games' sections
  are reported as not supported yet and left out.
- **Accounts:** a UID given as a number is kept exactly as text. The server comes
  from Honkai: Star Rail's UID rule, kept behind a per-game interface; an
  unrecognised UID blocks its account. The account's `timezone` is its time-zone
  evidence and must agree with a saved account's; its `lang` is kept with each
  record.
- **Records:** each needs the fields UIGF requires for Star Rail and a name, item
  type and rarity; without them the import is refused, saying how many records
  lack which field. Records are stored in the same shape as retrieved ones.
- **Duplicates and conflicts:** by the roll's facts (roll ID, banner category,
  item ID, time and rarity), keeping the saved record; a pool ID equal to its
  category code is unknown. A conflict blocks the import and names the roll.
- **Review:** the review shows each account with its inferred server, and its
  new, skipped and conflicting rolls per category and the period covered, as
  retrieval's does; saving commits every account in one transaction.
- Errors never echo file contents; imported names are shown as text.

## Tasks

- [ ] **Facts-based duplicates.** Storage compares facts rather than whole
  records, for retrieval as well, with the pool-ID rule.
- [ ] **Server rule.** The per-game UID rule and offsets, Star Rail's verified
  for each server it claims ([file research](../../games/hsr/file-research.md)).
- [ ] **UIGF reading.** Detection, validation against a pinned local copy of the
  schema, and normalisation, with synthetic fixtures for every case the
  [UIGF skill](../../../.agents/skills/uigf/SKILL.md) lists and StarDB's shape.
- [ ] **Import screen.** File import as a second source, its review and its
  errors, by keyboard.
