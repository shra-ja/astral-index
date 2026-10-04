# Roll Tracker

A desktop app that keeps a durable, local record of your gacha rolls, starting
with Honkai: Star Rail and Genshin Impact. It fetches your history from HoYoverse
only when you ask, and keeps it on your computer: no account with us, no cloud,
no telemetry.

## Features

- **Retrieve your warp history on request.** Roll Tracker finds the warp history
  link the game saved when you last opened your history in game, by searching
  your installation or reading a cache file you choose, then retrieves every warp
  category from HoYoverse.
- **Refresh quickly.** By default a retrieval stops at rolls you already saved;
  a full retrieval fetches everything again.
- **Review before saving.** See the account, how many rolls are new, already
  saved or conflicting, and the period covered. Nothing is saved until you
  confirm, and a failed or cancelled retrieval changes nothing.
- **Browse saved history** by warp, newest first, without going online.
- **Keep accounts and servers apart,** and import as often as you like: repeated
  or overlapping retrievals add only new rolls.

Honkai: Star Rail retrieval works today. Genshin Impact, history-file imports,
account switching, filters, statistics, pity and backups are planned; see the
[roadmap](docs/product/ROADMAP.md).

## Built with

Tauri 2 with a Rust backend, a Vue 3 and TypeScript interface, and SQLite for
storage. Everything the app shows is bundled with it; it contacts only
HoYoverse's warp history service, and only when you ask. See the
[architecture](docs/architecture/ARCHITECTURE.md).

## Where history is stored

Imported history is kept in one SQLite file, `history.sqlite`, in the app's local
data folder:

| Platform | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Roll-Tracker` |
| Linux, including a Linux build run in WSL | `~/.local/share/roll-tracker` (or `$XDG_DATA_HOME/roll-tracker`) |

The same folder holds the window's browser profile (cache and similar files):
`EBWebView` on Windows, `webview` on Linux. It holds no roll history.

**Portable mode:** if a folder named `data` sits next to the application
executable, the database and browser profile are kept in that folder instead,
for example `D:\RollTracker\data\history.sqlite` beside
`D:\RollTracker\roll-tracker.exe`.
Create or remove the folder, then restart the app, to switch. If both locations
hold a database, the portable one is used and the other is left untouched.

To move existing history between the two locations:

1. Close Roll Tracker.
2. Copy `history.sqlite` from the old folder to the new one. Keep the original
   until you have checked your history in the new location.
3. Start Roll Tracker.

## Contributing

Setup, commands and checks are in [development](docs/development/DEVELOPMENT.md),
and the rules every change follows in [CONTRIBUTING](CONTRIBUTING.md).

## License

Roll Tracker is released under the [MIT License](LICENSE). Bundled third-party
files keep their own licences. Roll Tracker is not affiliated with or endorsed
by HoYoverse; game names belong to their owners.
