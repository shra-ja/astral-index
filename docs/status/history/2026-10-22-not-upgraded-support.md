# 2026-10-22: not-upgraded support (archived 2026-10-22)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## History that can't be upgraded (2026-10-22)

Integrated through PR #136.

`feat/not-upgraded-screen`: 0037's Migration recovery, native support for the screen. `history_status` fails with `history_not_upgraded`, naming the copy, for a history that can't be upgraded; a backup can be restored over one, keeping it as it is; and the mock's `failing-upgrade` scenario upgrades its history with a test-only migration the 1.0.0 fixture fails. Red first where the types allowed, each other rule broken on purpose; an end-to-end test drives the real failure. From the reviews: a failed restore keeps the failure remembered (red first), `history_status` returns the usual failure, and the mock's schema is the desktop's scenario. The screen follows in its own PR.

## Wide-window stall (2026-10-22)

Integrated through PR #137.

`test/wide-window-stall`: the wide-window end-to-end test timed out on 3 of 7 CI runs since #133; its snapshot showed the import's first step never answering. It didn't reproduce locally, 3 full runs on two cores included. Failure snapshots now also record whether IPC still answers and each IPC command's send and answer times, and stale snapshots are cleared, so the next CI failure shows which side stalled. Ruled out by simulation: Tauri's fallback to `postMessage` after one failed IPC fetch (it fails the import at once as an unreadable file, a separate bug) and resizing during the import; the native path can't stall, and no CI log shows a panic. What remains is the webview reading the file or its bytes crossing as a raw IPC body, which a native file picker would remove.

## Native cache file picker (2026-10-22)

Integrated through PR #138.

`feat/native-cache-picker`: [decision 0034](../../architecture/decisions/0034-native-cache-file-dialog.md). `choose_cache_file` opens the system's dialog from Rust (the mock answers from `cache-from.txt`) and holds the path; `extract_from_file` reads it natively, so no file bytes cross IPC; the picker is a plain button and a closed dialog changes nothing. Red first: the command's choice, the picker, the screens, the client and the flow; the file read's error mapping by breaking it, as its tests' types changed. The end-to-end tests choose through the mock; the bundled app's check refuses reading with nothing chosen. From the reviews: nothing else starts while the dialog is open (red first; the buttons stay focusable), and backup, restore and the cache file share one dialog helper. The real system dialog is tested only through the mock's answer; the Windows check in 0037's Verification covers it. Whether the CI stall goes will show in later runs.
