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

## Version from tags (2026-10-15)

Integrated through PR #118.
`build/tag-version`, [0039](../../product/features/0039-distribution.md): releases are versioned from git tags, built and drafted by one workflow, and ship as the executable alone, unsigned for now ([decision 0030](../../architecture/decisions/0030-tag-versioned-releases.md)); this PR removes the manifests' versions (Cargo keeps a `0.0.0` placeholder the Tauri CLI requires) and shows each build's identity in About. Version check, Rust, frontend, end-to-end and CI tests red, then green; a release built with `TAURI_CONFIG` reported its version and commit; local check passes (static 15 s, gates 240 s, probes 169 s).

## Release workflow (2026-10-15)

Integrated through PR #119.
`ci/release-workflow`, [0039](../../product/features/0039-distribution.md): a hand-started workflow works out the version and notes from the merged pull requests, refuses unless `main` passed every check, builds and smoke-tests the release executable and drafts the release; the notes' template was settled from drafts. Tooling and CI tests red, then green; local check passes (static 14 s, gates 234 s, probes 166 s).

## Launch background (2026-10-15)

Integrated through PR #120.
`fix/launch-background`, [0052](../../product/features/0052-windows-polish.md): the window and webview start in the sidebar's `#0b0d11` rather than white. No test can observe it (Tauri's mock runtime discards the colour; WebKitGTK paints the page's canvas over it), so a unit test checks it stays `main.css`'s `--sidebar` (red on drift, then green); the user chose it over the window colour after trying both on Windows. Local check passes (static 15 s, gates 234 s, probes 160 s).

## Shared Windows build (2026-10-15)

Integrated through PR #121.
`ci/shared-windows-build`, [0039](../../product/features/0039-distribution.md): one composite action, `.github/actions/build-windows`, builds and smoke-tests the Windows executable for both CI and the release workflow, from a version and build identity; the CI test checks only it builds or names a build, and that the two jobs' remaining settings match. CI tests red, then green.
