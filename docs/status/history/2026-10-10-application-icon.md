# 2026-10-10: application icon (archived 2026-10-10)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Application icon (2026-10-10)

Integrated through PR #88.
Feature 0047's second task, on `feat/app-icon`: `npm run icons` renders the app
icons from the brand files; `icons:check`, in `npm run check`, fails on stale
ones. Tests failed first, then passed; the `.deb` and `.exe` carry the icons.
CI timed out on the suite discovery probe; PR #89 gave it 6 minutes.
