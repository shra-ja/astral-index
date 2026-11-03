# 2026-11-03: Windows first start (archived 2026-11-03)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows first start (2026-11-03)

Integrated through PR #160.

`test/windows-first-start`: the Windows smoke test's first launch twice went 30 s without its webview's first read creating the history (#159's first CI attempt and main's run 41555389433), against none in the 40 runs before, with the same runner image for at least the last 16; later launches in a job take 1–2 s. Its wait is now 90 s, stated as a cold-start bound, and each launch logs how long the history took after the window opened; a timeout says whether WebView2's profile folder exists and how many of its processes run. Verified by #160's CI run (41562705476): the history took 8.1 s after the first window opened and 0.4 s after the portable one.
