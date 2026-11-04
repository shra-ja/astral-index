# 2026-11-03: Windows first start (archived 2026-11-03)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows first start (2026-11-03)

Integrated through PR #160.

`test/windows-first-start`: the Windows smoke test's first launch twice went 30 s without its webview's first read creating the history (#159's first CI attempt and main's run 41555389433), against none in the 40 runs before, with the same runner image for at least the last 16; later launches in a job take 1–2 s. Its wait is now 90 s, stated as a cold-start bound, and each launch logs how long the history took after the window opened; a timeout says whether WebView2's profile folder exists and how many of its processes run. Verified by #160's CI run (41562705476): the history took 8.1 s after the first window opened and 0.4 s after the portable one.

## File import commands (2026-11-03)

Integrated through PR #161.

`feat/file-import-commands`, 0030's fourth task: `choose_history_file` holds a file chosen in the open dialog (UIGF's JSON, or the mock's `history-from.txt` answer), `read_history_file` reads it within 64 MiB and lists its Star Rail accounts with the server each goes into or why it can't, and `preview_file_account` previews one as a `uigf` import for `commit_import` or `discard_import`, using the file up. A saved UID keeps its saved server; a new one takes the rule's, and its time zone must match. The cache file's chooser now chooses either file. The mock's accounts are now `800000001` (Asia) and `600000002` (America), following the rule; README screenshots keep the old UIDs until next retaken. The webview does not call the commands yet. Red: the mock's UIDs failed the rule, a UIGF batch read as damage, the history chooser and both registration tests failed, and the read and preview tests failed against stubs; green: all 299 unit tests pass at 100% unit coverage, and an end-to-end test imports a StarDB-shaped file through the mock into its retrieved account, adding only the new roll.

## Bounded file read (2026-11-03)

Integrated through PR #162.

`refactor/bounded-file-read`: every cache, player log and history file, whether chosen or discovered, is opened through one `selected_file` module, which refuses anything but a regular file without blocking on a FIFO, and cache and history files are read through its one bounded read, refusing more than their bound after one byte past it. Acquisition no longer lends its opener to the history file, and the history file no longer repeats the bounded read. A history file over 64 MiB is now refused by the read, as before by the reader, with the same failure; player logs' failures are the module's own rather than a cache's. Red: the module's three tests failed against stubs; green: all 302 unit tests pass at 100% unit coverage. Left for later: restore opens its chosen backup without the module's regular-file check, so a FIFO chosen there would block, and the in-memory filesystem test double still lives under acquisition though eleven modules use it.

## Safety copy names (2026-11-03)

Integrated through PR #163.

`fix/safety-copy-names`: a restore's safety copy, and the copy kept before an upgrade, take `-1`, `-2` and on before the extension when a file already has their name, instead of failing. The names come from the local time to the second, which repeats when the clock is corrected or daylight saving ends; the end-to-end restore test failed locally once on its second restore, most likely so: its two restores are several seconds apart, so WSL2's clock, which steps when it resyncs, would have stepped back that far. Nothing else in the code yields that failure there. The test's 1 s wait between them, which never set the gap, is gone. Red: a taken safety copy name failed the restore, and the shared copy's numbering test failed against a stub; green: all 301 unit tests pass at 100% unit coverage, and the restore end-to-end test passed three times running without the wait.
