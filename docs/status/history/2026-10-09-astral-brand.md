# 2026-10-09: Astral brand (archived 2026-10-10)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Sidebar lockup (2026-10-09)

Integrated through PR #87.
Feature 0047's first task, on `feat/sidebar-lockup`. Decision 0023: the sidebar
shows the Astral emblem tile beside the wordmark, sized from an 18 px wordmark,
and the collapsed sidebar the 32 px tile alone; the brand's small-set files are
kept as supplied in `src-ui/src/assets/brand/`. Evidence: the `AstralTile` and
sidebar tests failed first, then passed; end to end, the lockup check failed on
the old sidebar, then passed with a 43.2 px tile, 12.6 px gap, 18 × 130 px
wordmark, 110% emblem and the brand colours, expanded and collapsed.
