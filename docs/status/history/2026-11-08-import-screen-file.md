# 2026-11-08: Import screen's file import (archived 2026-11-08)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### Import screen's file import (2026-11-08)

Integrated through PR #166.

`feat/import-screen-file`: 0030's Import screen, from the approved mockup. "Choose file…" reads a UIGF file and reviews its only importable account, or shows its accounts to choose from with why the others can't be imported; the review names the file, counts banners (pool IDs) added and stays savable when they are all it adds. Red: the new client, message, flow and component tests failed first (missing commands, messages and events), and the four app tests failed on the old view; green: all 458 frontend tests at 100% coverage, and a new end-to-end test picks the mock's file account by keyboard and saves it. From review: the flow is now `useImport`, and native failures a union keyed by kind (a plain failure sent with a code is refused, red first). Remaining: the user's StarDB check on Windows.
