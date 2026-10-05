# 0034 — Banner metadata

Status: Planned · Milestone 9, History browsing and statistics

Map HSR pool IDs to banners without making imports depend on it.

## Tasks

Each task is one PR, in this order. Imports stay independent of metadata
lookup.

- [ ] Decide where banner metadata comes from: HSR `gacha_id` pool IDs mapped to
  banners, their dates and featured items. Nothing may be fetched at runtime, so
  the metadata ships with the app and is updated with releases. Record the
  source, its licence, how it is verified and how it is updated as a decision.
- [ ] Show banner names in the list's Banner column, keeping placeholder art,
  with rolls on unknown pool IDs shown as unknown rather than guessed.
- [ ] Colour 5★ pity by 50/50 outcome (won, lost, guaranteed) from featured
  items. Until metadata covers a roll's banner, its outcome is unavailable and
  the control stays disabled with an explanatory tooltip.
