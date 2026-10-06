# 2026-10-06: account switching (archived 2026-10-06)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Account switching (2026-10-06)

Integrated through PR #74. Feature 0032's first task, on
`feat/account-switcher`. A new `saved_accounts` command lists the game's accounts with their roll totals, newest import first,
and `history_page` takes an optional account, refusing one that isn't saved.
With more than one account, the header's chip becomes a menu button (decision
0013, amended with the canvas mockup): arrow keys, Home, End, Enter, and Escape,
Tab or a press outside to close. Each game's choice lasts until restart or a
save into that game.

Evidence: the storage, command, client, composable, component and app tests each
failed first (missing methods, command, export and component; the old Genshin
call list), then passed; the real-SQLite test failed with the order reversed.
The end-to-end test now switches accounts with the keyboard in the mock binary.
The staged `npm run check` and offline tests pass, and a release `.deb` builds
without warnings.
