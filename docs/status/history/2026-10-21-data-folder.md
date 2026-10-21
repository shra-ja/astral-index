# 2026-10-21: data folder (archived 2026-10-21)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Data folder (2026-10-21)

Integrated through PR #134.

`refactor/data-folder`: the data folder is held once, by `Database`; About keeps its mode and opener, the dialogs setting is managed alone, and `choose_restore` no longer pairs two copies (a reviewer finding from #133). No behaviour change: the existing tests pass unchanged in what they check, and a new IPC case covers the About commands without a database. Also: a failing end-to-end test now saves `failed-<test name>.png` and `.txt` to `test-results/`, which CI uploads, after the wide-window test timed out on 2 of 4 CI runs since #133 with nothing to show; it then passed 3 CI runs, so the cause is still unknown.
