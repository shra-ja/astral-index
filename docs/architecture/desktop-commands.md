# Desktop commands

Status: implemented. See decisions
[0006](decisions/0006-desktop-extraction-commands.md),
[0007](decisions/0007-validate-during-extraction.md) and
[0014](decisions/0014-mock-debug-binary.md).

The webview reaches native code only through these commands, listed once in
`src-tauri/src/desktop/commands.in` for both the library and the `build.rs` app
manifest. The manifest makes every command need a capability grant, and
`capabilities/main.json` grants exactly these to the main window; anything else
is refused. No plugins, arbitrary filesystem access or shell access are exposed.

| Command | Does | Contacts HoYoverse |
| --- | --- | --- |
| `extract_automatically` | Discover, extract and validate a context for the current user | Yes |
| `extract_from_file` | Extract and validate from the bytes of a file the user chose | Yes |
| `retrieve_history` | Retrieve every category (`mode`: `new` or `full`), streaming progress over a channel, and preview it | Yes |
| `cancel_acquisition` | Cancel the running operation and drop the context and any preview | No |
| `commit_import` | Commit the held preview | No |
| `discard_import` | Drop the held preview | No |
| `history_page` | One page of saved history and every category's count, for the `account` named (UID and server) or else the account imported last | No |
| `last_import` | The newest import's summary | No |
| `saved_accounts` | The game's saved accounts with their roll totals, the account imported last first | No |

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

## IPC rules

- Paths never cross IPC. The file command takes a raw IPC body holding the file's
  bytes (the webview rejects files over 16 MiB before reading); the CSP allows
  only Tauri's local `ipc:` origins, so raw bodies use the custom-protocol IPC.
- Contexts, cached URLs, HTTP statuses, API messages and response text never
  reach the webview. Results and failures are small typed values; failures are
  `{"kind": …}` categories, plus the API code for `api_error` and the failing
  category and page for retrieval failures. The full list lives with the
  messages that describe them in `src-ui/src/messages.ts`.
- The webview's `src-ui/src/commands.ts` treats any rejection that is not exactly
  a known failure shape as `unavailable`.

## Transports and builds

Commands take their transport from a managed `Network`: HTTPS in the app, or the
synthetic HoYoverse of the mock debug binary, which also keeps its history in its
own `astral-index-mock` folder, never uses portable mode and clears its webview
profile at start. The shipped app never constructs the mock transport. Only
debug builds read `ASTRAL_INDEX_ZOOM` to zoom the webview.
