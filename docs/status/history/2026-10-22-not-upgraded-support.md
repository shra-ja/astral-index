# 2026-10-22: not-upgraded support (archived 2026-10-22)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## History that can't be upgraded (2026-10-22)

Integrated through PR #136.

`feat/not-upgraded-screen`: 0037's Migration recovery, native support for the screen. `history_status` fails with `history_not_upgraded`, naming the copy, for a history that can't be upgraded; a backup can be restored over one, keeping it as it is; and the mock's `failing-upgrade` scenario upgrades its history with a test-only migration the 1.0.0 fixture fails. Red first where the types allowed, each other rule broken on purpose; an end-to-end test drives the real failure. From the reviews: a failed restore keeps the failure remembered (red first), `history_status` returns the usual failure, and the mock's schema is the desktop's scenario. The screen follows in its own PR.
