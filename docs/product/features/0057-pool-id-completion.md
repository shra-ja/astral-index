# 0057 — Pool ID completion

Status: Planned · Milestone 12, Genshin Impact and the banner catalogue

Fill in the pool IDs that history files could not supply, such as StarDB's, so
history assembled from several sources matches what HoYoverse would return
([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
It needs the banner catalogue's pools and their periods
([0034](0034-banner-metadata.md)) and stays local.

## Requirements

- **Automatic:** a roll without a pool ID gets the pool the catalogue shows as
  the only one of its category open at its time.
- **By the user:** where several pools of the category were open, as with
  concurrent banners, the user assigns a pool to a set of rolls, chosen by
  category and time range, from the pools the catalogue shows open then; no
  other value can be entered.
- **In the import flow:** after a file is read, a pool step appears only when
  some rolls still need a choice, and is skipped otherwise. The same step is
  reachable for saved rolls without a pool ID, such as those imported before the
  catalogue existed.
- **In the record:** the pool ID is written into the roll's record, so banner
  names, outcomes and UIGF export use it like any other.
- **Logged:** each completion is logged with the roll, the pool, whether it was
  automatic or chosen, and when, so a completion can be undone and a later
  source's real pool ID replaces it.

## Tasks

- [ ] Specify the step, its storage and the log once the catalogue's pool
  periods are defined.
- [ ] Automatic completion and the pool step in the import flow.
- [ ] The step for saved rolls, undo, and replacement by a real source.
