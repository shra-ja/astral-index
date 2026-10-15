# 2026-10-15: Windows smoke test (archived 2026-10-15)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows smoke test (2026-10-15)

Integrated through PR #114.
`test/windows-e2e`: 0038's manual checklist replaced by a Windows smoke test of the release executable and a one-off live sign-off ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)); a WebDriver suite on Windows was dropped, as WebView2 ignores the debugging flag from the environment. Red, then green on CI: a console subsystem and a renamed portable folder each failed it; local check passes (static 15 s, gates 237 s, probes 160 s).
