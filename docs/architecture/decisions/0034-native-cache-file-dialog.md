# 0034 — Native cache file dialog

Date: 2026-10-22
Status: Accepted; supersedes the file fallback of
[decision 0006](0006-desktop-extraction-commands.md).

## Context

Decision 0006 had the webview read the user's chosen cache file through an HTML
file input and send its bytes to `extract_from_file` as a raw IPC body, so that
no dialog plugin was added; the user accepted that the file's bytes, auth keys
included, passed through webview memory. Since then the app gained the dialog
plugin for backup and restore, which open their dialogs from Rust so the webview
never names or reads a file ([decision 0031](0031-sqlite-snapshot-backups.md)).

The raw-body path has two problems:

- When one IPC request over Tauri's custom protocol fails, Tauri sends every
  later command in that webview through `postMessage`, which delivers raw bytes
  as JSON. From then on every file import fails as unreadable; a simulation
  confirmed it on 2026-10-22.
- An end-to-end test's file import stalled on 3 of 7 CI runs: the webview never
  got an answer to `extract_from_file`. The native side cannot stall on that path,
  so the loss lies in the webview's file read or the raw body's IPC transport.

## Decision

- **The cache file is chosen in a native dialog.** `choose_cache_file` opens the
  system's open dialog from Rust, without a file-type filter, as `data_2` has no
  extension, and holds the chosen path natively. It returns only the file's name,
  or a cancellation, which leaves the Import screen as it was.
- **Rust reads it.** `extract_from_file` takes no body: it reads the held file
  within the existing 16 MiB bound, finds the warp history link and validates it,
  as before. The path never crosses IPC and the file's bytes never enter the
  webview.
- **The mock answers the dialog from a file,** `cache-from.txt` in its data
  folder, as it does for backup and restore
  ([decision 0014](0014-mock-debug-binary.md)).

## Consequences

No IPC command takes a raw body, so the `postMessage` fallback no longer breaks
file imports. Choosing and validating are two commands, so the Import screen
shows its progress only once a file is chosen. The HTML file input and its
webview-side size check go. Whether the CI stall goes too will show in later
runs; the end-to-end failure snapshot's IPC trace stays to diagnose it if not.
(Added 2026-10-29, counts corrected 2026-10-30: it recurred in 2 of 38 CI
attempts, both on `main`, with neither the file read nor a raw body in play, so
the stall lies elsewhere, likely in WebKitGTK's IPC on the GTK main thread. It
never reproduced locally. The wide-window test now zooms the page out instead
of resizing the window to 2560×1440, the only conditions unique to that test,
so later runs no longer test this decision.)
