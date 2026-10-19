# 2026-10-19: app-wide screen (archived 2026-10-20)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## App-wide screen (2026-10-19)

Integrated through PR #131.

`feat/app-wide-backup`: Backup & Restore is app-wide at `/backup`, in a sidebar "Data" group below View, designed on the canvas first; no game is current there, and the View group keeps the game shown last. Sidebar and app tests red first on the old address; the end-to-end test checks the new one. Two reviewer agents: correctness found nothing; quality's two points fixed, red first: app-wide screens named in one place (`isGameScreen`), and the shell follows the first game even when the route resolves before mounting.
