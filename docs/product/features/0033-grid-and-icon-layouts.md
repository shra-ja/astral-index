# 0033 — Grid and icon layouts

Status: Planned · Milestone 9, History browsing and statistics
Decisions: [0013](../../architecture/decisions/0013-visual-design.md)

Alternative history layouts with placeholder art.

## Tasks

Each task is one PR, in this order.

- [x] Add the styled tooltip from decision 0013 as a shared component: shown
  after a short delay and on keyboard focus, never the browser's `title`.
- [ ] Add the List, Grid and Icons layout switch with the Grid layout, with
  placeholder art. The chosen layout lasts while the screen is open, across
  categories and accounts.
- [ ] Add the Icons layout: tiles with placeholder art and pity, one Tab stop
  with arrow keys, Home and End moving between tiles, each naming its roll in a
  styled tooltip on focus and under the pointer.

The icons-and-banner-art toggle and the Banner column belong to
[0036](0036-item-icons-and-banner-art.md), and the 50/50 button to
[0034](0034-banner-metadata.md), since all three need the banner catalogue.
