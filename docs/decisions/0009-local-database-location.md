# 0009 — Local database location

Date: 2026-09-28
Status: Accepted for the local-database step of milestone 3; no command uses it yet.

## Context

Storage (decision 0003) takes a database path from its native caller, but no
caller had chosen one. The acquisition commands need a single, predictable
database that is created without user setup, is never exposed to the webview,
and does not block the async workers that run IPC commands and HTTPS requests.

## Decision

Keep the history database at `history.sqlite` in Tauri's local app data folder
(`app_local_data_dir`) for the application identifier `com.shra-ja.roll-tracker`:

| Platform | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\com.shra-ja.roll-tracker` |
| Linux, including WSL | `$XDG_DATA_HOME/com.shra-ja.roll-tracker`, by default `~/.local/share/com.shra-ja.roll-tracker` |
| macOS | `~/Library/Application Support/com.shra-ja.roll-tracker` |

The user chose the local folder so history never roams with a Windows profile.
Only Windows distinguishes local from roaming app data. A Linux build run inside
WSL is a Linux process and uses the WSL home, so it keeps a separate database
from the Windows build of the same version.

- `desktop::register` resolves the folder in Tauri's setup hook and manages a
  `Database` holding it. Nothing is created or opened at startup.
- The first `Database::run` creates the folder if needed and opens the store;
  later calls reuse the open store. Store initialization (decision 0003) creates
  a new schema or accepts only a compatible existing one.
- `run` executes its SQLite work on Tokio's blocking thread pool, so IPC and
  network tasks are never blocked by the database.
- A missing folder, a folder path occupied by a file, a failed open or a panic
  during the work is reported as the storage `Database` error, with no path. A
  panic drops the open store, so the next call reopens it.
- The path never crosses IPC; only the native side can choose or open it.

## Alternatives and consequences

- **Open at startup:** would fail visibly before the user asks for anything and
  would touch the disk for users who never import. Lazy opening avoids both.
- **Roaming app data (`%APPDATA%`) on Windows:** first proposed, then rejected.
  On domain-managed machines with roaming profiles it can be copied to a server
  at sign-out, which conflicts with keeping player data local.
- **Next to the executable (portable mode):** the next roadmap step, as an
  addition rather than a replacement. It needs a seamless way to choose that
  location and to move existing history.
- **Synchronous calls on the async worker:** simpler, but a large commit could
  stall other commands, including cancel.

## Evidence

Unit tests use the filesystem and SQL doubles to cover opening on first use,
reuse, a missing or occupied folder, a failed open, running on another thread
and a panic. A registration test runs Tauri's setup hook under the mock runtime
and checks the managed path. On Linux the local and roaming folders coincide, so
the Windows location still needs checking on Windows after the first import. An
integration test opens real SQLite in a new nested temporary folder, confirms
nothing exists before first use, and runs twice against the same database.
