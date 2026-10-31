# 2026-10-30: wide page by zoom (archived 2026-10-30)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Wide page by zoom (2026-10-30)

Integrated through PR #155.

`test/wide-window-zoom`: the wide-window e2e test opens the mock zoomed out to half size, so its window's 1200 pixels hold a page 2400 wide, instead of resizing the window to 2560×1440. Its webview stalled in 2 of 38 CI attempts since decision 0034, both on `main` (7 of 56 since 2026-10-21): the native side answered `extract_from_file` on time, but the webview's fetch never settled. 920 local runs never reproduced it, including CI's desktop services and 4 pinned cores, so the resize and the huge window, the only conditions unique to this test, are gone; the cause is shelved. Red: with the content width uncapped, the test fails with content 2104 wide; green: it passes, and `npm run check` passes in its three stages.

## Facts-based duplicates (2026-10-30)

Integrated through PR #156.

`feat/facts-based-duplicates`, 0030's first task: retrieval hands storage the rolls it parsed as one account's batch, and storage previews a batch from a named source. Rolls of one ID are the same roll when their category, item ID, time and rarity agree, so retrieval in another language no longer conflicts; a roll may lack a pool ID, and a duplicate bringing one fills it, counted as a duplicate and a pool ID added (the Import screen shows that count with file import). Migration 002 changes no tables but raises the schema version to 3, so 1.1.0 refuses such a history as newer. Red: the facts, pool ID and version tests failed (a translated page conflicted, filling switched off left the pool IDs missing, 1.1.0's schema accepted the history); green: all 277 unit and every integration test pass, at 100% unit coverage. `npm run check` passes in its three stages.
