# 2026-10-15: Windows smoke test (archived 2026-10-15)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows smoke test (2026-10-15)

Integrated through PR #114.
`test/windows-e2e`: 0038's manual checklist replaced by a Windows smoke test of the release executable and a one-off live sign-off ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)); a WebDriver suite on Windows was dropped, as WebView2 ignores the debugging flag from the environment. Red, then green on CI: a console subsystem and a renamed portable folder each failed it; local check passes (static 15 s, gates 237 s, probes 160 s).

## First-release sign-off (2026-10-15)

Integrated through PR #115.
`docs/release-sign-off`: the user retrieved real history on Windows with the CI build of `702d678` (SHA-256 checked): new rolls saved, History browsed, a full retrieval all skipped as saved, About working; 0038 done. A browser flagged the unsigned download (signing is 0039's); three UI problems went to [0052](../../product/features/0052-windows-polish.md). The STATUS budget now counts only the 100 lines above History (unit test red, then green); local check passes (static 15 s, gates 239 s, probes 160 s).

## Windows polish (2026-10-15)

Integrated through PR #116.
`fix/windows-polish`, [0052](../../product/features/0052-windows-polish.md): About closes from its backdrop and Close returns focus to the About button (it fell to the page body), the licence reflows into paragraphs, and History keeps a stable scrollbar gutter; every scrollbar is thin, in the app's colours. Unit and native tests red, then green; the gutter and scrollbars are checked by style, as WebKitGTK's scrollbars take no room; local check passes (static 14 s, gates 235 s, probes 159 s).

## Sidebar emblem (2026-10-15)

Integrated through PR #117.
`feat/sidebar-emblem`, [0052](../../product/features/0052-windows-polish.md): the sidebar shows the brand's open lockup and, collapsed, the emblem alone, without the tile; the app icon keeps its tile. Unit and native tests red, then green; local check passes (static 15 s, gates 242 s, probes 160 s).
