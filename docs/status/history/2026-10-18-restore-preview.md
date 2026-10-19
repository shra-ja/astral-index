# 2026-10-18: restore preview (archived 2026-10-19)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Restore, checking and preview (2026-10-18)

Integrated through PR #130.

`feat/restore-preview`: 0037's restore up to its confirmation: the shared `ActionCard`, the hardened check with distinct refusals, `Store::contents`, `choose_restore`/`cancel_restore` holding a checked copy in the data folder, and the Restore card and confirmation, its Restore button unavailable until replacing. Each layer red first. Two reviewer agents' findings fixed: leaving the confirmation cancels it after a prompt, the held copy keeps one name and is removed at startup, one shared status line. Decisions 0031 (amended) and 0033 recorded.
