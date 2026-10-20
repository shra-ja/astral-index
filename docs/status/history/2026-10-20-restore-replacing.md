# 2026-10-20: restore, replacing (archived 2026-10-20)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Restore, replacing (2026-10-20)

Integrated through PR #132.

`feat/restore-replace`: 0037's Restore, replacing. Confirming re-reads the history, keeps it as a dated safety copy (none when empty) and renames the flushed checked copy over it under the store's lock; a changed history or any failure leaves it as it was. Restore is refused while an import runs or awaits the user; closing the app drops a held copy through a plugin, leaving `main.rs` unchanged. The outcome shows on the Restore card, designed on the canvas first. Each layer red first; an end-to-end test restores through the mock. Reviewer agents found Windows refused every backup's and restore's flush (read-only handle); fixed red first, and Windows CI now runs their real-file tests.
