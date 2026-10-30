# 0030 — History-file import

Status: Planned · Milestone 11, Backup, restore and file import

Import Honkai: Star Rail history from UIGF v4.0 to v4.2 files, as a second source
on the Import screen beside retrieval, through the same review and save steps
([imports](../../architecture/imports.md),
[decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
File import stays local and never makes a network request.

## Requirements

- **Choosing a file:** the user chooses a file; its size is bounded at 64 MiB,
  enough for at least 100,000 rolls, and it must be UIGF with `info.version`
  from `v4.0` to `v4.2`. Other versions, legacy UIGF and SRGF are refused with
  what was found.
- **Sections:** the file's `hkrpg` accounts are read; other games' sections are
  reported as not supported yet and left out.
- **One account per import:** the review covers one account, as retrieval's
  does. The user picks from every Star Rail account in the file, saved before or
  not; importing the file again covers another. An account whose UID is
  malformed or has no server in the game's rule is listed as not importable,
  with the reason.
- **Accounts:** a UID given as a number is kept exactly as text. The server comes
  from Honkai: Star Rail's UID rule, kept behind a per-game interface. The
  account's `timezone` must equal its server's offset, or the account is listed
  as not importable. Its `lang` is kept with each record; a missing `lang` or
  `count` stays absent, and a `count` present must be `"1"`.
- **Records:** each needs the fields UIGF requires for Star Rail and a name, item
  type and rarity; without them the import is refused, saying how many records
  lack which field. Records are stored in the same shape as retrieved ones.
  Categories 21 and 22 are accepted only from `v4.1`, where UIGF added them.
- **Duplicates and conflicts:** by the roll's facts (roll ID, banner category,
  item ID, time and rarity), keeping the saved record. A pool ID equal to its
  category code is dropped, and the roll saved without one. A duplicate that
  brings a real pool ID gives it to a saved roll that has none or only a
  completed one, so the order of imports does not matter; such rolls count as
  skipped, with their own count. A conflict blocks the import and names the
  roll.
- **Pools:** once the catalogue exists, rolls without a pool ID go through
  [pool ID completion](0057-pool-id-completion.md) before the review.
- **Review:** the review shows the account with its inferred server, and its new,
  skipped and conflicting rolls per category and the period covered, as
  retrieval's does; saving commits in one transaction.
- Errors never echo file contents; imported names are shown as text.

## Tasks

One PR each, in order:

- [ ] **Facts-based duplicates.** Storage previews rolls already parsed, from
  any source, which names itself; the pool ID becomes optional; duplicates and
  conflicts compare facts rather than whole records, for retrieval as well; a
  duplicate fills a missing pool ID. Migration 002 changes no tables but raises
  the schema version to 3, so 1.1.0 refuses histories holding rolls without a
  pool ID as newer rather than damaged; the schema policy in
  [CONTRIBUTING](../../../CONTRIBUTING.md) says versions also cover the stored
  records' rules.
- [ ] **Server rule.** The per-game interface turning a UID into its server and
  offset, or the reason it can't, with Star Rail's rule from the
  [file research](../../games/hsr/file-research.md).
- [ ] **UIGF reading.** Detection, typed validation and normalisation in Rust,
  with synthetic fixtures for every case the
  [UIGF skill](../../../.agents/skills/uigf/SKILL.md) lists and StarDB's shape.
  Tests check each fixture against a pinned local copy of the schema, through a
  dev-only JSON Schema validator, so both give the same verdict.
- [ ] **File import commands.** Choosing the file and previewing one account,
  reusing retrieval's review, save and discard, with narrow permissions and the
  mock's scenarios. A second account means choosing the file again.
- [ ] **Import screen.** File import as a second source, its account picker,
  review and errors, by keyboard, from an approved mockup; then the docs, and a
  real StarDB export imported on Windows over retrieved history.
