# 2026-10-25: native times (archived 2026-10-26)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Native times (2026-10-25)

Integrated through PR #148.

`feat/native-times`: 0037's Native times. A desktop `local_time` module reads the local time for the upgrade's copy, the restore's safety copy and the backup's suggested name, and formats the kept copies' stamp (the backup's name takes its day); `save_backup` and `confirm_restore` take no arguments and lose their date and time checks and `invalid_request` (which stays for history requests), and the webview's `localDate` and `localTime` went with them. Each layer red first: the stamp's tests, backup's and restore's against a fixed time, the commands over IPC with no arguments, the frontend sending none.
