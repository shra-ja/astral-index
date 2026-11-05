# 2026-11-04: Restore's regular-file check (archived 2026-11-05)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Restore's regular-file check (2026-11-04)

Integrated through PR #164.

`fix/restore-regular-file`: a backup chosen for restore is opened through `selected_file`, as caches, player logs and history files are, so a named pipe is refused at once as not a backup instead of blocking until something writes to it, and a folder or a file whose type can't be told is refused without being read. Red: a real named pipe made restore wait the test's 3 s, and a folder was copied as an empty backup; green: all 305 unit tests pass at 100% unit coverage, and the restore integration tests pass on a real pipe.
