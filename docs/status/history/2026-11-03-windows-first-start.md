# 2026-11-03: Windows first start (archived 2026-11-03)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows first start (2026-11-03)

Integrated through PR #160.

`test/windows-first-start`: the Windows smoke test's first launch twice went 30 s without its webview's first read creating the history (#159's first CI attempt and main's run 41555389433), against none in the 40 runs before, with the same runner image for at least the last 16; later launches in a job take 1–2 s. Its wait is now 90 s, stated as a cold-start bound, and each launch logs how long the history took after the window opened; a timeout says whether WebView2's profile folder exists and how many of its processes run. Verified by #160's CI run (41562705476): the history took 8.1 s after the first window opened and 0.4 s after the portable one.

## File import commands (2026-11-03)

Integrated through PR #161.

`feat/file-import-commands`, 0030's fourth task: `choose_history_file` holds a file chosen in the open dialog (UIGF's JSON, or the mock's `history-from.txt` answer), `read_history_file` reads it within 64 MiB and lists its Star Rail accounts with the server each goes into or why it can't, and `preview_file_account` previews one as a `uigf` import for `commit_import` or `discard_import`, using the file up. A saved UID keeps its saved server; a new one takes the rule's, and its time zone must match. The cache file's chooser now chooses either file. The mock's accounts are now `800000001` (Asia) and `600000002` (America), following the rule; README screenshots keep the old UIDs until next retaken. The webview does not call the commands yet. Red: the mock's UIDs failed the rule, a UIGF batch read as damage, the history chooser and both registration tests failed, and the read and preview tests failed against stubs; green: all 299 unit tests pass at 100% unit coverage, and an end-to-end test imports a StarDB-shaped file through the mock into its retrieved account, adding only the new roll.
