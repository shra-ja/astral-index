

## Date-range filter (2026-10-06)

Integrated through PR #78. Feature 0032's fifth and last task, on
`feat/date-range-filter`; 0032 is done. `history_page` now takes one optional
`filter` (rarities, search, and `from` and `to` server days, each a real
`YYYY-MM-DD` date), and the ordered pass keeps whole days at both ends. The
toolbar's date button opens the popover from decision 0013: quick ranges
counting today in server time, From and To fields, the timezone and stored
period, Clear and Done; changes apply at once.

Evidence: the storage, formatter, client, composable, component and app tests
failed first (missing date fields, helpers, filter object, dates, component and
button), then passed; the desktop tests were reshaped with the code, and a date
filter that keeps everything fails them. The end-to-end test opens the popover
with the keyboard, keeps only 28 Sep's rolls, and closes it with Escape.
The staged `npm run check` and offline tests pass on the first run, and a
release `.deb` builds cleanly.
