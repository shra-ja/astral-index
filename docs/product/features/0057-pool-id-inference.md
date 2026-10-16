# 0057 — Pool ID inference

Status: Planned · Milestone 12, Genshin Impact and the banner catalogue

Fill in the pool IDs that history files could not supply, such as StarDB's,
where the banner catalogue makes them certain
([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
It follows [0034](0034-banner-metadata.md) and stays local.

## Requirements

- A saved roll without a pool ID gets one only when the catalogue shows exactly
  one pool of the roll's category open at its time; otherwise it stays unknown.
- An inferred pool ID is kept apart from the source's fields and marked as
  inferred, so a roll's record still holds only what its source gave.
- Banner names, outcomes and UIGF export use inferred pool IDs, and say which
  rolls rely on one.
- A later source giving the roll's real pool ID replaces the inference.

## Tasks

- [ ] Specify the inference and its storage once the catalogue's pool periods
  are known.
