# 0034 — Banner metadata

Status: Planned · Milestone 12, Genshin Impact and the banner catalogue
Decisions: [0022](../../architecture/decisions/0022-banner-catalogue-downloader.md)

Map rolls to banners from a user-selected catalogue folder, without making
imports depend on it.

## Tasks

Each task is one PR, in this order. Imports stay independent of the catalogue,
and the application never fetches metadata: a separate downloader writes the
catalogue folder (decision 0022).

- [ ] Define the catalogue folder format with the downloader: its version and
  compatibility rule; banners keyed by Star Rail `gacha_id` or by Genshin Impact
  category and time window, with names, dates, featured items, rate-up rule and
  pity group; items with names and rarity; the asset manifest; and each entry's
  sources and verification. Record it as a decision, with synthetic fixtures.
- [ ] Load a catalogue folder the user selects: validate it as untrusted input,
  keep a copy in the application's data folder, replace it on a later load, and
  show its version and coverage. No network requests.
- [ ] Show banner names in the list's Banner column, keeping placeholder art,
  with rolls on pools the catalogue lacks shown as unknown rather than guessed.
- [ ] Colour 5★ pity by 50/50 outcome (won, lost, guaranteed) from verified
  featured items. Where the catalogue does not verify a roll's banner, its
  outcome is unavailable and the control stays disabled with an explanatory
  tooltip.
