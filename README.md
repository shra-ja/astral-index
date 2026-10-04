# Roll Tracker

An open-source desktop application that keeps a local record of gacha roll
history, starting with Honkai: Star Rail and Genshin Impact. History is fetched
from HoYoverse only on the user's request and stored on the user's computer. The
application has no user accounts, cloud storage or telemetry.

## Features

- Retrieval of Honkai: Star Rail warp history on request. The application finds
  the warp history link that the game cached when the history was last opened in
  game, either by searching the installation or by reading a chosen cache file,
  then retrieves every warp category from HoYoverse.
- Two retrieval modes: by default a retrieval stops at rolls that are already
  saved; a full retrieval fetches the whole history again.
- A review before saving, showing the account, the numbers of new, already saved
  and conflicting rolls, and the period covered. Nothing is saved until the review
  is confirmed, and a failed or cancelled retrieval changes nothing.
- Browsing of saved history by warp, newest first, without network access.
- Separate history per account and server. Repeated or overlapping retrievals add
  only new rolls.

Genshin Impact, history-file imports, account switching, filters, statistics,
pity and backups are planned; see the [roadmap](docs/product/ROADMAP.md).

## Architecture

Tauri 2 with a Rust backend, a Vue 3 and TypeScript interface, and SQLite for
storage. All interface assets are bundled. The only network service contacted is
HoYoverse's warp history service, and only on the user's request. See the
[architecture](docs/architecture/ARCHITECTURE.md).

## Storage

Imported history is kept in one SQLite file, `history.sqlite`, in the app's local
data folder:

| Platform | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Roll-Tracker` |
| Linux, including a Linux build run in WSL | `~/.local/share/roll-tracker` (or `$XDG_DATA_HOME/roll-tracker`) |

The same folder holds the window's browser profile (cache and similar files):
`EBWebView` on Windows, `webview` on Linux. It holds no roll history.

### Portable mode

If a folder named `data` sits next to the application executable, the database
and browser profile are kept in that folder instead, for example
`D:\RollTracker\data\history.sqlite` beside `D:\RollTracker\roll-tracker.exe`.
Create or remove the folder, then restart the app, to switch. If both locations
hold a database, the portable one is used and the other is left untouched.

To move existing history between the two locations:

1. Close Roll Tracker.
2. Copy `history.sqlite` from the old folder to the new one. Keep the original
   until the history has been checked in the new location.
3. Start Roll Tracker.

## Contributing

Setup, commands and checks are in [development](docs/development/DEVELOPMENT.md),
and the rules every change follows in [CONTRIBUTING](CONTRIBUTING.md).

## License

Roll Tracker is released under the [MIT License](LICENSE). Bundled third-party
files keep their own licences. Roll Tracker is not affiliated with or endorsed
by HoYoverse; game names belong to their owners.
