# 0027 — History screen

Status: Done · Milestone 7, Saved history display and refresh
Decisions: [0013](../../architecture/decisions/0013-visual-design.md)

Show saved history from local storage without triggering acquisition.

## Tasks

- [x] Display stored history from local storage without triggering acquisition.
- [x] Show the History screen: category tabs (a dropdown when they do not
  fit), the paged list with item, rarity, type and time, and the empty state.
  Show the most recently imported account; switching accounts is milestone 9.
- [x] Show friendly server names (for example "Asia" for
  `prod_official_asia`) wherever the account's server appears, falling back
  to the raw value for unknown servers.
