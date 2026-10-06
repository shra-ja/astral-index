

## Summary strip (2026-10-06)

Integrated through PR #75. Feature 0032's second task, on `feat/summary-strip`.
Each history page now carries a summary of its whole category: 5★ and 4★
counts and the oldest and newest roll times, from one grouped query. The strip under the tabs shows rolls
stored, both counts with two-decimal rates, and the stored period; an empty
category shows zeros and "None yet" (decision 0013, amended).

Evidence: the storage, formatter, component and app tests failed first (missing
summary type and field, formatters and component; the app tests without the
strip), then passed; the real-SQLite test failed with `min` swapped for `max`.
The end-to-end test checks the rates against the counts, and the two-by-two
layout at the minimum width.
The staged `npm run check` and offline tests pass, and a release `.deb` builds
without warnings.
