# 0032 — Account switching and filters

Status: Planned · Milestone 9, History browsing and statistics
Decisions: [0013](../../architecture/decisions/0013-visual-design.md)

Switch accounts and servers, filter and search, with totals and rarity breakdowns.

## Tasks

Each task is one PR, in this order. Stored-history reads stay local and never
trigger acquisition.

- [x] Switch accounts: a native command lists the game's saved accounts (UID and
  server), the history read takes the chosen account, and the header's account
  chip becomes the account switcher. The account imported last stays the
  default.
- [x] Show the summary strip for the whole category: rolls stored, 5★ and 4★
  counts with rates, and the stored period
  ([decision 0013](../../architecture/decisions/0013-visual-design.md)).
- [x] Filter by rarity (5★, 4★, 3★) in the rolls panel's toolbar. Filters apply
  to the whole category, not only the current page, so the native read filters
  before paging and returns the filtered count for "Showing … of N". Measure the
  read on a large synthetic history; add an indexed rarity column to the schema
  only if the measurement needs one. Measured: about 38 ms for 20,000 rolls in
  one category, so none was added ([storage](../../architecture/storage.md)).
- [x] Search items by name, case-insensitively, through the same native filter
  as rarity.
- [ ] Filter by a date range in server time, through the same native filter: the
  toolbar's date-range button and popover, with quick ranges and From and To
  fields ([decision 0013](../../architecture/decisions/0013-visual-design.md)).
