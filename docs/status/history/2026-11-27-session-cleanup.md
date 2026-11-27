# 2026-11-27: end-to-end session cleanup and shared file writing (archived 2026-11-27)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### End-to-end session cleanup (2026-11-27)

Integrated through PR #176.

`test/driver-cleanup`: a fix for main's failed CI run, where the CSP mutation probe stalled until its 600 s bound. A failed test's session delete could leave the app running, holding the Vitest worker's output open. Ending a session in `tests/app-driver.ts` now also stops the driver's descendants, inside its process group, bounds the delete at 15 s and never waits for a driver that has already exited; `close` waits for the app to end, so its coverage file is whole. Red: a new end-to-end test whose session delete fails found the app still running, and the run stalled; green: it and the shell test pass with nothing left running.

### Shared file writing (2026-11-27)

Integrated through PR #175.

`refactor/shared-file-writing`: 0055's seventh task, a refactor with no change in behaviour. Backup's whole-file write moves into `desktop/replacing_file.rs`: `ReplacingFile` claims an unused `.partial` name beside the target, is written through its path, then is flushed and renamed over the target, and removes the temporary file when dropped unpublished or when publishing fails. A guard rather than a function taking the writing step, as backup's step is asynchronous and tells a failed write from a damaged history. `real`, `in_data_folder` and `publish`, renamed `flush_and_rename` as the guard has its own `publish`, move with it; restore uses them from there, and the kept copy's naming (`keep_copy`) shares its `first_unused` loop. The claiming and publishing tests move with the code; backup keeps its own failures. From review: the mock filesystem's readers (`has`, `removed_files`, `renamed`) are shared rather than repeated in each test module, and a backup whose future is dropped mid-write would now remove its temporary file too, where it was left before; nothing in the app drops it. All desktop unit tests pass, and Rust unit coverage stays at 100% per file.
