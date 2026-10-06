# 0019 — Pity derived on read

Date: 2026-10-06
Status: Accepted

## Context

The History screen's Pity column (feature 0035) needs each roll's pity. Pity
depends on every earlier roll in its pity group, and importing older rolls
changes the pity of every later one. Without verified banner metadata, each
banner category is its own pity group ([statistics](../statistics.md)). The page
read already makes one ordered pass over the category in Rust, numbering every
roll before filters apply ([storage](../storage.md)).

## Decision

- **When:** pity is counted on read, in the page read's ordered pass, before any
  filter applies. Nothing is stored.
- **What:** every roll shows its 5★ pity count: how many rolls it is since the
  previous 5★ in its pity group, counting itself. A 5★ shows the pity it came at;
  other rolls show the running count, which restarts after each 5★.
- **Incomplete history:** counts start at the oldest stored roll, as though the
  stored rolls were complete, and show as plain numbers. Rolls before a group's
  first stored 5★ may undercount when older rolls aren't saved; the column does
  not mark them.

The user chose these on 2026-10-06.

## Alternatives and consequences

- **Storing pity at import:** cheaper reads, but importing older rolls would
  rewrite every later roll's pity in the same transaction, and any change to pity
  groups or rules would be a data migration.
- **Each rarity's own pity** (4★ rows showing rolls since the previous 4★ or 5★):
  shows the 4★ guarantee, but mixes two counts in one column.
- **Marking uncertain counts** ("23+" before the first stored 5★): the brief asks
  that uncertain statistics be visibly identified. With plain numbers, that
  criterion is left to another way of showing incomplete history, such as a
  coverage notice, not each count.
- Filters, search and dates never change pity, since it is counted first.
- Pity groups that span categories, once metadata defines them, need the pass to
  read every category in a group; the count itself stays the same.

## Evidence

The page read's ordered pass took about 48 ms for 20,000 rolls on 2026-10-06
(storage); counting pity adds one comparison per roll.
