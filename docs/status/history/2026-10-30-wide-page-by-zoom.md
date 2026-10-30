# 2026-10-30: wide page by zoom (archived 2026-10-30)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Wide page by zoom (2026-10-30)

Integrated through PR #155.

`test/wide-window-zoom`: the wide-window e2e test opens the mock zoomed out to half size, so its window's 1200 pixels hold a page 2400 wide, instead of resizing the window to 2560×1440. Its webview stalled in 2 of 38 CI attempts since decision 0034, both on `main` (7 of 56 since 2026-10-21): the native side answered `extract_from_file` on time, but the webview's fetch never settled. 920 local runs never reproduced it, including CI's desktop services and 4 pinned cores, so the resize and the huge window, the only conditions unique to this test, are gone; the cause is shelved. Red: with the content width uncapped, the test fails with content 2104 wide; green: it passes, and `npm run check` passes in its three stages.
