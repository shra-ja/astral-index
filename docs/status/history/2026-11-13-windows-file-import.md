# 2026-11-13: history-file import on Windows (archived 2026-11-24)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### History-file import on Windows (2026-11-13)

Integrated through PR #167.

`docs/archive-import-screen-file`: the user imported a real StarDB UIGF export on Windows; a file that isn't UIGF was refused with an error. Not checked on Windows: a later retrieval filling the file's pool IDs, and keyboard use. 0030 is done.

### Release 1.2.0 (2026-11-13)

Recorded on 2026-11-24; STATUS did not record the release at the time.

[1.2.0](https://github.com/shra-ja/astral-index/releases/tag/v1.2.0) is released from `2af18ba`, with history-file import: the Import screen reads UIGF v4.0 to v4.2 files' Star Rail accounts, duplicates are matched by their facts and missing pool IDs filled. Saved history is upgraded on first start after a dated copy is kept, and earlier releases can't open it.
