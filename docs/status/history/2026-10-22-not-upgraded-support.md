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

## Stalled package downloads in CI (2026-10-22)

Integrated through PR #140.

`ci/bounded-apt-install`: the runners' Azure Ubuntu mirror has been slow at times since 2026-10-22 10:00 UTC (6–9 minute downloads, then ~45 kB/s), a known open issue (actions/runner-images#14823); retrying the same mirror didn't help. The Linux setup now installs its OS packages from a cache `main` saves, keyed by package list and runner image; on a miss, a download that outlasts its bounded first attempt drops the Azure mirror and continues from Ubuntu's own archive. From reviewing the pipelines: publishing relies on GitHub's default for its needs, not `always()` and hand-checked results; it keeps the unverified build, so re-running a passed job no longer fails its publish; a rule keeps status functions to reports and uploads; CI's version comes from release tags only; the build commit is named once. Red first: `tooling/ci.test.ts` runs the package step against a stand-in `sudo` that stalls an update or a download, and fails when the fallback, the bounds, the cache's steps or a leftover is put back. Not yet seen in CI: the cache helps only once `main` has saved it, and the fallback only when the mirror is slow. Follow-ups: CI tests that parse the workflows, setting the Windows shell and the Rust profile in the setup actions, gating releases on the check workflow's run, and the Rust cache keys. In CI after merging: the fallback ran on three of six jobs, each recovering within 25 s, and `main` saved both package caches.

## History that can't be upgraded, screen (2026-10-22)

Integrated through PR #139.

`feat/not-upgraded-screen-ui`: 0037's Migration recovery, screen. A history that couldn't be upgraded opens History Unavailable (option A on the canvas) before any game screen: the router asks `history_status`, later commands switch to it too, and the sidebar locks the game screens. Its card names the copy, advises reinstalling the previous version, reporting or restoring, and restores a backup through the usual confirmation, after which Backup & Restore says how it went. Each layer red first; an end-to-end test drives the mock's failing upgrade through to a restore. From the reviews: a restore from Backup & Restore now unlocks the app too, locked links stay named and focusable, and the card shows its latest failure (each red first).
