# 2026-10-10: application icon (archived 2026-10-10)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Application icon (2026-10-10)

Integrated through PR #88.
Feature 0047's second task, on `feat/app-icon`: `npm run icons` renders the app
icons from the brand files; `icons:check`, in `npm run check`, fails on stale
ones. Tests failed first, then passed; the `.deb` and `.exe` carry the icons.
CI timed out on the suite discovery probe; PR #89 gave it 6 minutes.

## Astral brand closed (2026-10-10)

Integrated through PR #90.
On `docs/close-astral-brand`: decision 0013 points to 0023, and 0047 is done;
no old mark's path data or colours remain outside archived history.

## Size overlay (2026-10-10)

Integrated through PR #92.
0048's first task, on `feat/size-overlay`: `ASTRAL_INDEX_SIZE_OVERLAY=1` shows
the window's size in debug builds. Tests failed first, then passed natively.

## Review in small windows (2026-10-10)

Integrated through PR #93.
0048's second task, on `fix/review-small-windows`: Review Import's sections no
longer shrink, so the body scrolls to every category. Native check red, then green.
