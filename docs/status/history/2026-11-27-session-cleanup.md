# 2026-11-27: end-to-end session cleanup (archived 2026-11-27)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### End-to-end session cleanup (2026-11-27)

Integrated through PR #176.

`test/driver-cleanup`: a fix for main's failed CI run, where the CSP mutation probe stalled until its 600 s bound. A failed test's session delete could leave the app running, holding the Vitest worker's output open. Ending a session in `tests/app-driver.ts` now also stops the driver's descendants, inside its process group, bounds the delete at 15 s and never waits for a driver that has already exited; `close` waits for the app to end, so its coverage file is whole. Red: a new end-to-end test whose session delete fails found the app still running, and the run stalled; green: it and the shell test pass with nothing left running.
