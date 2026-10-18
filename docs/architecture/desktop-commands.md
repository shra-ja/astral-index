# Desktop commands

Status: implemented. See decisions
[0006](decisions/0006-desktop-extraction-commands.md),
[0007](decisions/0007-validate-during-extraction.md),
[0014](decisions/0014-mock-debug-binary.md),
[0024](decisions/0024-about-opening.md) and
[0031](decisions/0031-sqlite-snapshot-backups.md).

The webview reaches native code only through these commands, listed once in
`src-tauri/src/desktop/commands.in` for both the library and the `build.rs` app
manifest. The manifest makes every command need a capability grant, and
`capabilities/main.json` grants exactly these to the main window; anything else
is refused. No plugins, arbitrary filesystem access or shell access are exposed;
the opener plugin's functions are called from native code only, and the plugin
is not registered. The dialog plugin is registered for the real app, as its save
and open dialogs need it, but the capability grants none of its permissions, and a test
checks its commands are refused: only native code opens a dialog. The plugin
also injects a script that routes `window.alert` and `window.confirm` to its
refused commands, so the webview must not use them.

| Command | Does | Contacts HoYoverse |
| --- | --- | --- |
| `extract_automatically` | Discover, extract and validate a context for the current user | Yes |
| `extract_from_file` | Extract and validate from the bytes of a file the user chose | Yes |
| `retrieve_history` | Retrieve every category (`mode`: `new` or `full`), streaming progress over a channel, and preview it | Yes |
| `cancel_acquisition` | Cancel the running operation and drop the context and any preview | No |
| `commit_import` | Commit the held preview | No |
| `discard_import` | Drop the held preview | No |
| `history_page` | One page of saved history, every category's count and the category's summary, for the `account` named (UID and server) or else the account imported last, showing the `filter` asked for: `rarities` (`5`, `4`, `3`), a `search` of item names (at most 100 characters, ignoring case), and `from` and `to` server days (`YYYY-MM-DD`); each part left out shows everything | No |
| `last_import` | The newest import's summary | No |
| `saved_accounts` | The game's saved accounts with their roll totals, the account imported last first | No |
| `app_info` | The app's version, which build it is (a release, a CI build of a commit, or local), the data folder in use, the history file in it and whether portable mode is on | No |
| `reveal_data_folder` | Show `history.sqlite` selected in the system file manager, or open the data folder before the file exists | No |
| `open_issues_page` | Open the repository's issues page in the default browser | No |
| `save_backup` | Ask where to save in the system's save dialog, suggesting `Astral-Index-backup-<date>.sqlite` from the `date` sent (`YYYY-MM-DD`), then write a checked snapshot there; returns the file's name or a cancellation. A place inside the data folder is refused (`backup_in_data_folder`), and a snapshot that fails its check is `history_damaged`. The mock debug binary answers from `save-as.txt` in its data folder | No |
| `choose_restore` | Ask which backup to restore in the system's open dialog, copy it into the data folder under a temporary name claimed new, check the copy as untrusted input and hold it; returns the backup's file name, what it holds and what the current history holds (accounts with roll totals, and the last import), or a cancellation. Choosing a file drops any copy held before. A backup inside the data folder is refused (`restore_in_data_folder`), one that fails its check is `restore_refused` with the reason (`too_large`, `not_database`, `other_app`, `newer`, `damaged`, `unreadable`), and a copy that cannot be made or read is `restore_failed`. The mock debug binary answers from `restore-from.txt` in its data folder | No |
| `cancel_restore` | Drop the held copy of the backup; the history is unchanged | No |

## Session

The native session holds at most one acquisition, in memory: the validated
context, the retry budget its validation started, a cancellation token, and
later the preview.

- Starting an operation cancels any earlier one. A validated context is kept only
  if its operation was not cancelled meanwhile, checked under the session lock.
- `retrieve_history` checks its `mode` first, then takes the context and budget
  out of the session, so the auth key is dropped when retrieval ends, whatever
  the outcome. Without one it fails with `no_context`.
- The preview is kept for commit unless the operation was cancelled. A commit
  uses it up whatever the outcome; without one, commit fails with `no_preview`.
- A commit is atomic and quick, so it is not cancellable.
- Apart from the acquisition, the restore state holds at most one checked copy
  of a backup, in the data folder under the one name `restore.sqlite.partial`,
  until it is cancelled or another backup is chosen; the webview cancels it
  when the user leaves its confirmation. A copy an earlier run left, as the app
  closed or crashed, is replaced by the next one and removed at startup.

## IPC rules

- Paths never cross IPC, except the data folder and history file that `app_info`
  returns for the About dialog and the Backup & Restore screen to show; the
  webview never builds a path itself. `save_backup` returns only
  the saved file's name, and `choose_restore` only the chosen file's. The file command takes a raw IPC body holding the file's
  bytes (the webview rejects files over 16 MiB before reading); the CSP allows
  only Tauri's local `ipc:` origins, so raw bodies use the custom-protocol IPC.
- Contexts, cached URLs, HTTP statuses, API messages and response text never
  reach the webview. Results and failures are small typed values; failures are
  `{"kind": …}` categories, plus the API code for `api_error`, the reason for `restore_refused`, and the failing
  category and page for retrieval failures. The full list lives with the
  messages that describe them in `src-ui/src/messages.ts`.
- The webview's `src-ui/src/commands.ts` treats any rejection that is not exactly
  a known failure shape as `unavailable`.

## Transports and builds

Commands take their transport from a managed `Network`: HTTPS in the app, or the
synthetic HoYoverse of the mock debug binary, which also keeps its history in its
own `astral-index-mock` folder, never uses portable mode and clears its webview
profile at start. It never launches a file manager or browser: it records each
request to open in `opened.txt` in that folder. The shipped app never constructs the mock transport. Only
debug builds read `ASTRAL_INDEX_ZOOM` to zoom the webview.
