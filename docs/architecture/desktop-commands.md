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
| `choose_cache_file` | Ask which cache file to read in the system's open dialog, with no file-type filter as `data_2` has no extension, and hold its path natively; returns the file's name or a cancellation, and reads nothing. A choice that is not a local file, or a failed dialog, is `invalid_file`. The mock debug binary answers from `cache-from.txt` in its data folder ([decision 0034](decisions/0034-native-cache-file-dialog.md)) | No |
| `extract_from_file` | Read the held cache file natively within its 16 MiB bound, then extract and validate a context from it, as `extract_automatically` does: too large is `file_too_large`, no request is `no_request`, and nothing chosen or a file that can't be read is `invalid_file` | Yes |
| `retrieve_history` | Retrieve every category (`mode`: `new` or `full`), streaming progress over a channel, and preview it | Yes |
| `cancel_acquisition` | Cancel the running operation and drop the context and any preview | No |
| `commit_import` | Commit the held preview | No |
| `discard_import` | Drop the held preview | No |
| `history_page` | One page of saved history, every category's count and the category's summary, for the `account` named (UID and server) or else the account imported last, showing the `filter` asked for: `rarities` (`5`, `4`, `3`), a `search` of item names (at most 100 characters, ignoring case), and `from` and `to` server days (`YYYY-MM-DD`); each part left out shows everything | No |
| `last_import` | The newest import's summary | No |
| `saved_accounts` | The game's saved accounts with their roll totals, the account imported last first | No |
| `history_status` | Open the history if it isn't open, and say whether it can be used: nothing when it can, or the failure any use of it would get, such as `history_not_upgraded` with the copy kept before a failed upgrade. The shell calls it once at startup, before showing a game screen | No |
| `app_info` | The app's version, which build it is (a release, a CI build of a commit, or local), the data folder in use, the history file in it and whether portable mode is on | No |
| `reveal_data_folder` | Show `history.sqlite` selected in the system file manager, or open the data folder before the file exists | No |
| `open_issues_page` | Open the repository's issues page in the default browser | No |
| `save_backup` | Ask where to save in the system's save dialog, suggesting `Astral-Index-backup-<date>.sqlite` from the local date, then write a checked snapshot there; returns the file's name or a cancellation. A place inside the data folder is refused (`backup_in_data_folder`), and a snapshot that fails its check is `history_damaged`. The mock debug binary answers from `save-as.txt` in its data folder | No |
| `choose_restore` | Ask which backup to restore in the system's open dialog, copy it into the data folder under a temporary name claimed new, check the copy as untrusted input and hold it; returns the backup's file name, what it holds and what the current history holds (accounts with roll totals, and the last import; `null` when the history is from an older release and couldn't be upgraded), or a cancellation. The copy is checked against, and upgraded to, the schema the history is opened with. Choosing a file drops any copy held before. The history file itself, compared by its real path, is refused (`restore_is_history`), while any other file in the data folder, such as a safety copy, is checked as any backup is. The held copy itself is refused as `restore_refused` (`not_database`), and stays held. A backup that fails its check is `restore_refused` with the reason (`too_large`, `not_database`, `other_app`, `newer`, `damaged`, `unreadable`), and a copy that cannot be made or read is `restore_failed`. The mock debug binary answers from `restore-from.txt` in its data folder | No |
| `cancel_restore` | Drop the held copy of the backup; the history is unchanged | No |
| `confirm_restore` | Replace the history with the held copy: read the history again under the store's lock (one that couldn't be upgraded is handed over unopened, and kept as a safety copy exactly as it is), copy it to `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder (a name claimed new; no copy for a history without accounts), flush the held copy and rename it over `history.sqlite`; the store reopens it when next used. Returns the safety copy's name, or none. The held copy is used up whatever the outcome. A history that changed since the confirmation is `restore_changed`; a history that cannot be read is `storage`; a copy that cannot be made or put in place, or no held copy, is `restore_failed`; each leaves the history as it was and removes any safety copy it made | No |

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
  with the summary of the history it was compared with, until it is restored,
  cancelled or another backup is chosen; the webview cancels it when the user
  leaves its confirmation, and a small plugin drops it as the app exits. A copy
  a crash left is replaced by the next one and removed at startup.
- An import is under way from the start of validating a link to the end of
  retrieval, counted by a guard each holds, and awaits the user while a link
  or review is held. Meanwhile `choose_restore`, before any dialog, and
  `confirm_restore` are refused with `import_under_way`, so a review is never
  saved into a history it was not counted against. The check comes before
  `confirm_restore` waits for the store's lock, so a retrieval started in that
  moment could read the old history and save into the restored one; the UI
  rules this out, as the confirmation fills the screen and leaving waits while
  it restores. A choice made while a confirm puts its copy in place is refused,
  as it would copy to the same name.

## IPC rules

- Paths never cross IPC, except the data folder and history file that `app_info`
  returns for the About dialog and the Backup & Restore screen to show; the
  webview never builds a path itself. `save_backup` returns only
  the saved file's name, `choose_restore` only the chosen file's, and
  `confirm_restore` only the safety copy's, and `choose_cache_file` only the
  cache file's. No command takes a file's bytes: the native side reads every
  file the user chooses ([decision 0034](decisions/0034-native-cache-file-dialog.md)).
  The CSP allows only Tauri's local `ipc:` origins, for the custom-protocol IPC.
- Contexts, cached URLs, HTTP statuses, API messages and response text never
  reach the webview. Results and failures are small typed values; failures are
  `{"kind": …}` categories, plus the API code for `api_error`, the reason for `restore_refused`, the copy's file name (or `null` when none was kept) for `history_not_upgraded`, which any command that uses the history returns once an older release's history failed to upgrade, and the failing
  category and page for retrieval failures. The full list lives with the
  messages that describe them in `src-ui/src/messages.ts`.
- The webview's `src-ui/src/commands.ts` treats any rejection that is not exactly
  a known failure shape as `unavailable`.

## Transports and builds

The data folder is held once, by the managed `Database`; the About, backup and
restore commands read it, and the history file's path, from there. Commands take
their transport from a managed `Network`: HTTPS in the app, or the
synthetic HoYoverse of the mock debug binary, which also keeps its history in its
own `astral-index-mock` folder, never uses portable mode and clears its webview
profile at start. It never launches a file manager or browser: it records each
request to open in `opened.txt` in that folder. The shipped app never constructs the mock transport. Only
debug builds read `ASTRAL_INDEX_ZOOM` to zoom the webview.
