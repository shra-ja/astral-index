# 2026-10-21: data folder (archived 2026-10-21)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Data folder (2026-10-21)

Integrated through PR #134.

`refactor/data-folder`: the data folder is held once, by `Database`; About keeps its mode and opener, the dialogs setting is managed alone, and `choose_restore` no longer pairs two copies (a reviewer finding from #133). No behaviour change: the existing tests pass unchanged in what they check, and a new IPC case covers the About commands without a database. Also: a failing end-to-end test now saves `failed-<test name>.png` and `.txt` to `test-results/`, which CI uploads, after the wide-window test timed out on 2 of 4 CI runs since #133 with nothing to show; it then passed 3 CI runs, so the cause is still unknown.

## Migration recovery (2026-10-21)

Integrated through PR #135.

`feat/migration-recovery`: 0037's Migration recovery, native part. Opening an older release's history runs its pending migrations in one transaction after copying it to `history-v<N>-YYYYMMDD-HHMMSS.sqlite`; a failed upgrade is remembered and every use refuses with `history_not_upgraded`, naming the copy. The check builds each version's schema from the same steps. No real migration yet: a test-only one upgrades the 1.0.0 fixture. Each rule's test fails with it broken. From the reviews: references are enforced only after the upgrade commits and checked before, so a migration can rebuild a referenced table (red first on the 1.0.0 fixture), and backup and restore pass the failure on. The screen follows in its own PR, then native times for backup and restore.
