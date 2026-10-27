# 2026-10-26: backup and restore verification (archived 2026-10-26)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Backup and restore verification (2026-10-26)

Integrated through PR #149.

`test/backup-restore-verification`: 0037's Verification. `restore.rs` restores a backup of two accounts and three imports, and the 1.0.0 file under the app's schema and a later one, into a new data folder with the same accounts, rolls and imports. An end-to-end test restores the 1.0.0 file into the mock's fresh profile, backs it up and restores that into another fresh profile, with no safety copy and the 1.0.0 file's rows both times. The tests cover existing behaviour, so they passed on their first run; each failed when restore was changed to never put its copy in place. On Windows, the user checked the dev build of `3487c09`: the save and open dialogs, a backup to another folder or drive, a restore into a fresh profile, portable mode and the data-folder refusal, and the cache file dialog, where focus stays on its button after cancelling and moves to the progress's Cancel after choosing. 0037 is done.

## Date popover clipping (2026-10-26)

Integrated through PR #150.

`fix/date-popover-clipping`: with only a few rolls in the chosen dates, the rolls panel's clipped corners cut the date popover off below its quick ranges, hiding From, To, Clear and Done. The popover now floats with `@floating-ui/vue`, fixed to the window as the tooltips are: below the button, above it without room, following it while shown, and closing once the screen scrolls the button out of view, as the user chose, rather than floating over the header; focus then returns to the button without scrolling back. Red first: the end-to-end test's two-row date step found Done unpressable at its centre, and the popover open after scrolling its button away, which the component's test also showed, as it did focus left on the page; all pass with the fix, and the end-to-end test fails if returning focus scrolls the screen back. The date filter's `offset` prop is now `serverOffset`, so it no longer shares a name with Floating UI's `offset`.
