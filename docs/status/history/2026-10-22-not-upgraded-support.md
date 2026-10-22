# 2026-10-22: not-upgraded support (archived 2026-10-22)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## History that can't be upgraded (2026-10-22)

Integrated through PR #136.

`feat/not-upgraded-screen`: 0037's Migration recovery, native support for the screen. `history_status` fails with `history_not_upgraded`, naming the copy, for a history that can't be upgraded; a backup can be restored over one, keeping it as it is; and the mock's `failing-upgrade` scenario upgrades its history with a test-only migration the 1.0.0 fixture fails. Red first where the types allowed, each other rule broken on purpose; an end-to-end test drives the real failure. From the reviews: a failed restore keeps the failure remembered (red first), `history_status` returns the usual failure, and the mock's schema is the desktop's scenario. The screen follows in its own PR.

## Wide-window stall (2026-10-22)

Integrated through PR #137.

`test/wide-window-stall`: the wide-window end-to-end test timed out on 3 of 7 CI runs since #133; its snapshot showed the import's first step never answering. It didn't reproduce locally, 3 full runs on two cores included. Failure snapshots now also record whether IPC still answers and each IPC command's send and answer times, and stale snapshots are cleared, so the next CI failure shows which side stalled. Ruled out by simulation: Tauri's fallback to `postMessage` after one failed IPC fetch (it fails the import at once as an unreadable file, a separate bug) and resizing during the import; the native path can't stall, and no CI log shows a panic. What remains is the webview reading the file or its bytes crossing as a raw IPC body, which a native file picker would remove.
