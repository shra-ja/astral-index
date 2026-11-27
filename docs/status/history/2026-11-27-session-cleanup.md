# 2026-11-27: end-to-end session cleanup, shared file writing, the shared opener and the export command (archived 2026-11-27)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### End-to-end session cleanup (2026-11-27)

Integrated through PR #176.

`test/driver-cleanup`: a fix for main's failed CI run, where the CSP mutation probe stalled until its 600 s bound. A failed test's session delete could leave the app running, holding the Vitest worker's output open. Ending a session in `tests/app-driver.ts` now also stops the driver's descendants, inside its process group, bounds the delete at 15 s and never waits for a driver that has already exited; `close` waits for the app to end, so its coverage file is whole. Red: a new end-to-end test whose session delete fails found the app still running, and the run stalled; green: it and the shell test pass with nothing left running.

### Shared file writing (2026-11-27)

Integrated through PR #175.

`refactor/shared-file-writing`: 0055's seventh task, a refactor with no change in behaviour. Backup's whole-file write moves into `desktop/replacing_file.rs`: `ReplacingFile` claims an unused `.partial` name beside the target, is written through its path, then is flushed and renamed over the target, and removes the temporary file when dropped unpublished or when publishing fails. A guard rather than a function taking the writing step, as backup's step is asynchronous and tells a failed write from a damaged history. `real`, `in_data_folder` and `publish`, renamed `flush_and_rename` as the guard has its own `publish`, move with it; restore uses them from there, and the kept copy's naming (`keep_copy`) shares its `first_unused` loop. The claiming and publishing tests move with the code; backup keeps its own failures. From review: the mock filesystem's readers (`has`, `removed_files`, `renamed`) are shared rather than repeated in each test module, and a backup whose future is dropped mid-write would now remove its temporary file too, where it was left before; nothing in the app drops it. All desktop unit tests pass, and Rust unit coverage stays at 100% per file.

### Shared opener (2026-11-27)

Integrated through PR #177.

`refactor/shared-opener`: a refactor with no change in behaviour, added to 0055 before the export command. Opening a file, a folder or the issues page moves out of `desktop/about.rs` into `desktop/opener.rs`: the `Opener` (the system's, or the mock's recording), its targets and `open`, with their tests. The `Opener` is managed as its own state, so `About` keeps only whether the data folder is portable, and the export command can open UIGF's standard without reaching into the About dialog. The opening's tests move with it, and the setup tests check the opener as its own state; all desktop unit tests pass, and Rust unit coverage stays at 100% per file, `opener.rs` included. From review: the issues page is called a fixed address rather than the only one, ahead of the standard's, and the launcher double's `opened` reader is shared.

### Export command (2026-11-27)

Integrated through PR #178.

`feat/export-command`: 0055's ninth task. `desktop/export.rs` adds `export_uigf`, which reads All accounts or the one named through `store.histories`, builds the file through `file_export` with the app's version and the current time, and refuses an export with nothing to write before the save dialog opens; the dialog suggests `Astral-Index-UIGF-YYYY-MM-DD.json` (the mock answers from `export-as.txt`), a target in the data folder is refused, and the file is written through `ReplacingFile`. It returns the file's name and each account's outcome, never logged. New failure kinds: `nothing_to_export` (with each account's outcome), `export_invalid`, `export_failed` and `export_in_data_folder`; an unreadable history, a stored roll that is not JSON included, is `storage`. `open_uigf_standard` opens UIGF's standard through a new opener target. Both are in the command manifest and the capability, and the account-key check is shared with `history_page`. From review: backup and export share one save dialog, `dialogs::save_as`, whose tests move there; the name and timestamp come from one moment, `local_time::moment`; and the file is built and checked off the async workers, after the read. Red: 7 of the 11 export unit tests failed against placeholder bodies, and CI's test failed until its Windows step ran the new `tests/export.rs` real-file tests, which read back a replaced file, leave no partial file after a failed rename, refuse the data folder and fail a non-JSON payload as `storage`. Green: all 328 Rust unit tests, the 4 real-file tests, CI's tests and Clippy pass, and Rust unit coverage stays at 100% per file; a first full check found the export's argument handling and a refused dialog answer untested, now covered. The webview's types and messages come with the screen.
