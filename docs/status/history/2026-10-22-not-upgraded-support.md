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

## Shared status card (2026-10-23)

Integrated through PR #141.

`refactor/status-card`: the History Unavailable card and the Import screen's progress, failure and result cards repeated one frame; they now share `StatusCard` (a narrower `result` variant for what a save added), and the two failure cards `FailureSummary`, the warning, heading and message. From the reviews: the failure summary takes its message as a prop, and the failure cards' tests check that each alert is named by its heading. Headings and text that take focus only to be announced lose their outline through one rule in `main.css`, not five; it leaves the account menu's items alone. The four cards' tests pass unchanged; the new parts' tests red first. Follow-up: one icon tile for the four copies. Small visual changes: Import's failure card is as wide as the others (640px, from 600), and the progress card's spacing 22px, from 24. In CI, #141's Linux jobs restored their OS packages from the cache, with nothing left to download.

## Shared icon tile (2026-10-23)

Integrated through PR #142.

`refactor/icon-tile`: the 44px icon tile repeated by `ActionCard`, `FailureSummary` and `HistoryFailed` is one `IconTile` with a neutral, accent or error tone, hidden from screen readers. From the review, it takes the icon itself and draws it at the tile's size, so the six cards passing an icon no longer each repeat that size; `ActionCard`'s icon slot is now a prop. `ImportSaved`'s 56px round badge stays its own. Red first: the tile's test, then the three cards' tests asking for it; no visual change.

## CI tests that parse the workflows (2026-10-24)

Integrated through PR #143.

`test/parse-ci-workflows`: `tooling/ci.test.ts` reads the workflows and actions with the `yaml` package (2.9.1, a new dev dependency with none of its own) and checks what each job and step does: conditions, inputs, cache keys, step order and which job runs what, finding steps by name, action or command. The redundant `always()` survived because the old tests matched exact text, so a cleanup failed them while a leftover with the same meaning passed. Evidence: an `always()` or a hand check of needed jobs' results on the publish job, `delete-merged`, a quoted boolean and an `always()` on the build step each fail the new tests; a block-style `needs` list, a folded `if` and quoted strings pass them, while each failed the old tests. Text is still read only for the pinned actions' version comments and for things that must appear nowhere. From the reviews: the release upload's path is checked again (the rewrite had dropped it), every use of a pin needs its own `# v<digit>` comment, inputs are traced through the whole release workflow in any form, every setup input's boolean must be unquoted, the status-function rule catches hyphenated job names, and two new checks refuse `continue-on-error` and `write-all`/`read-all` permissions; each was confirmed by breaking it.

## Setup actions own the job environment (2026-10-24)

Integrated through PR #144.

`ci/setup-owns-environment`: each Linux job set `ASDF_RUST_PROFILE` and each Windows job, in both workflows, `npm_config_script_shell`, with the reason given once. The Linux setup now sets the profile on its asdf step, and the Windows setup makes Git Bash npm's script shell through `$GITHUB_ENV` as its first step, which holds for the rest of the job; jobs keep only `defaults.run.shell`, which an action can't set. Red first: a test that the setup actions set both, that no job repeats them and that each Windows job sets up before running npm; removing the step or repeating it in a job fails it. That the Windows jobs still run their scripts through Git Bash shows only in this PR's CI run. In CI, #144's Windows jobs passed, running npm's scripts through Git Bash.
