# 0037 — Backup and restore

Status: In progress · Milestone 11, Backup, restore and file import

A backup file holding the whole history, which a fresh profile can restore,
on a new **Backup & Restore** screen in the sidebar
([decision 0031](../../architecture/decisions/0031-sqlite-snapshot-backups.md)).
As it covers every game, the screen is app-wide, outside the selected game's
screens ([decision 0033](../../architecture/decisions/0033-app-wide-and-per-game-screens.md)).
Backup and restore stay local and never make a network request.

## Requirements

- **Back up:** a save dialog, opened by the Rust side, suggests
  `Astral-Index-backup-YYYY-MM-DD.sqlite`; the app writes a consistent snapshot
  of the database with `VACUUM INTO` to a temporary file beside the target,
  checks it as restore would, flushes it to disk, then renames it into place.
  The temporary file is claimed new (`.partial`, else `.1.partial` and on), so
  a file the user has is never touched. A target inside the data folder is
  refused, as it could replace the history itself. A failure leaves no partial
  file and says what went wrong: the chosen place, the history failing its
  check, or the history not being readable.
- **Restore:** an open dialog, opened by the Rust side, chooses the file. Restore
  checks a copy before anything changes:
  - it is at most 256 MiB, and it is a SQLite database with the app's application
    ID;
  - its schema version is a released one no newer than the app's; a newer one is
    refused as "made by a newer version of Astral Index";
  - it passes SQLite's integrity check and has exactly the schema of its
    version;
  - it migrates to the current schema.

  As the file is untrusted, the check runs on a copy inside the data folder,
  enforces the size bound before opening, compares the schema before the
  integrity check, and opens with `trusted_schema` off, SQLite's defensive mode,
  no memory mapping and lowered limits, so a hostile file cannot run its own
  constraints or stall the app. The safety copy gets the same data-folder guard
  as backups. A source inside the data folder is refused only when it is the
  history itself, `history.sqlite`, so a safety copy can be restored where it
  is.

  The confirmation then shows the backup's accounts, their roll counts and its
  last import beside the current history's, and says that the current history
  will be kept as a safety copy. On confirming, the current database is copied
  to `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder and the
  checked copy replaces it; the screens then show the restored history. Cancel
  or any failure leaves the current history untouched. Leaving the
  confirmation asks first, and leaving cancels the restore, so a checked copy
  is never left held.
- **Migration recovery:** before upgrading an older database on opening, the app
  copies it to `history-v<N>.sqlite` in the data folder; a migration runs in one
  transaction, and a failure leaves the original unchanged and names the copy.
  Each released version's expected schema, which the check compares against,
  is the one its migrations produce from the first release's schema, run in
  memory, not a fresh creation: an upgraded database's schema text differs from
  a newly created one's.
- Restore is unavailable while a retrieval or import is under way; a backup can
  be made at any time, as storage runs one operation at a time, so a snapshot is
  always consistent. In portable mode, safety copies go to the portable data
  folder.
- The screen shows where history is stored, and errors never include file
  contents or full private paths.

## Tasks

- [x] **Backup.** The snapshot, its check, the dialog and the Backup & Restore
  screen with its Save backup action, in this order:
  - [x] Storage writes a snapshot with `VACUUM INTO`, and checks a database file
    as restore will: the app's application ID, a released schema version no newer
    than the app's, a passing integrity check and exactly that version's schema.
  - [x] A `save_backup` command opens the save dialog from Rust
    (`tauri-plugin-dialog`, with no webview permission), suggesting
    `Astral-Index-backup-YYYY-MM-DD.sqlite` from the date the webview sends,
    writes the snapshot to a temporary file beside the target, checks it and
    renames it into place, removing the temporary file on any failure. It
    returns the saved file's name, a cancellation or a failure. The mock debug
    binary answers the dialog with a path its tests choose.
  - [x] The Backup & Restore screen in the sidebar, after Import, with the
    `database-backup` icon: the Backup card with its working, saved and failed
    states, and where history is stored, with Open folder.
  - [x] An end-to-end test saves a backup through the mock and checks the file
    it wrote.
  - Each layer's tests failed first: storage's against missing functions, and
    each check's own test against that check disabled; the command's against
    stubs; the screen's against the missing modules and sidebar link. A real
    damaged page fails the check as unreadable before its integrity report,
    which unit tests cover. A backup can be made at any time, as storage runs
    one operation at a time. The webview sends the date, as `chrono` here has no
    clock; the screen sits under the current game, so the sidebar needs no
    special case.
  - A read-only reviewer agent found a backup could replace the live database
    and every failure asked for another folder. Fixed: the data-folder guard,
    distinct failures, a claimed temporary name that never removes the user's
    files, a flush before the rename, a dialog fault failing rather than
    cancelling, refusing non-UTF-8 paths, misplaced doc comments, a loading
    state for the data folder, and tests that the dialog plugin's commands are
    refused. Each fix's test failed with the fix undone; real-file tests cover
    replacing a chosen file, a failed rename and the data folder. The real save
    dialog runs only in release builds; its Windows check is in Verification.
  - A second reviewer agent, on code quality: saving is split into writing a
    checked snapshot and publishing it; `useDataFolder` serves About and Backup
    & Restore, which share one `DataFolder` component in About's boxed style,
    as the user chose; `app_info` sends the history file's path; the
    filesystem fake records every write; About's backup advice points here.
    The Backup card and the Import screen's source cards share their styles,
    to be extracted into one card component when the Restore card arrives.
- [ ] **Restore, checking and preview** (one PR). Choosing a backup, checking
  it as untrusted input and showing what it holds, without changing anything:
  - [x] Extract one card component from the Import screen's source cards and
    the Backup card, which share their markup and styles, with no change in
    behaviour or look.
  - [x] Harden the database check for untrusted files: refuse files over
    256 MiB before opening, room for several hundred thousand rolls; compare the schema before the integrity check; open with
    `trusted_schema` off, SQLite's defensive mode, no memory mapping and lowered
    limits; and report not a database, another app's, a newer version and
    damage as distinct errors.
  - `ActionCard` holds the shared card; screenshots of both screens at two
    widths match the previous build pixel for pixel. The check's tests failed
    first against the old check, and each rule's test fails with that rule
    removed. An unreleased version or a schema unlike its version's counts as
    damage. A history over the bound would fail its backup as damaged, as restore
    could not accept it.
  - `choose_restore`'s tests failed first against stubs, and each rule's test
    fails with the rule removed: the data-folder guard, the bound while
    copying, removing a refused copy, and dropping the copy held before.
    Without a data folder no dialog opens. Opening the checked copy as a store
    is its migration for now; the runner arrives with Migration recovery.
  - The confirmation shows the backup's file name, from `choose_restore`, and
    marks current accounts the backup lacks; its Restore button stays
    unavailable until Restore, replacing. Each layer's tests failed first; the
    end-to-end test checks a real backup through the mock, the held copy in the
    data folder, Cancel removing it and focus returning, and a refusal.
  - Two reviewer agents found a held copy outlived a normal quit, and eight
    used up backup's temporary names, blocking every later restore. Fixed as
    the user chose: leaving the confirmation cancels it after a prompt, the
    held copy keeps one name of its own, and startup removes it. Also fixed:
    the cards share one status line, and the restore flow keeps no state twice.
  - [x] Storage reads a checked file's summary for the confirmation: its
    accounts with their servers and roll counts, and its last import.
  - [x] A `choose_restore` command opens the open dialog from Rust, refuses a
    source inside the data folder, copies the file into the data folder under
    the one name only the held copy uses, `restore.sqlite.partial`, replacing an
    earlier run's copy, checks and migrates it, and holds it in the session; it returns the backup's summary and the current history's,
    never a path. A `cancel_restore` command removes the held copy. The mock
    debug binary answers the dialog from a file its tests write.
  - [x] The Restore card on Backup & Restore, and its confirmation, which
    replaces the screen's content, as the Import review does: both summaries
    side by side, Restore and Cancel, and its refusals and failures, by
    keyboard. Leaving the confirmation asks first, in a modal with Stay and
    Leave, and leaving cancels the restore; a copy left when the app closes is
    removed at the next start. The confirmation is designed on the canvas
    first.
- [x] **App-wide screen** (one PR). Move Backup & Restore out of the selected
  game's screens (decision 0033):
  - [x] The route becomes `/backup`, with no game. `/:game/backup` was never
    released, as 1.0.0 predates backups, so it is removed without a redirect.
  - [x] The sidebar gives it its own group above About. While it is open, the
    game switcher marks no game as current, choosing a game opens its History,
    and the View group's links keep pointing to the game shown last.
  - [x] The sidebar's new group is designed on the canvas first, without the
    Export card that moves to its own screen
    ([0055](0055-uigf-export.md)); the end-to-end tests reach the screen at its
    new address.
  - The user chose a "Data" group directly below View. The sidebar's and the
    app's tests failed first on the old per-game address; the old address
    returns to Star Rail's history, as any unknown one does. Opened on
    `/backup` before any game is shown, the View group offers the opening
    game's screens. At the 560px minimum height the expanded sidebar keeps
    50px clear above About with one game, enough for a development build's
    second.
- [x] **Restore, replacing** (one PR). Replacing the history with the checked
  copy:
  - [x] Restore is refused while an import is under way or held: a link being
    validated, a retrieval running, or a link or review awaiting the user.
    Choosing a backup and confirming one are both refused, as the user chose
    over discarding the import, so a review is never saved into a history it
    was not counted against. The rule lives on the native side alone, as the
    user chose: the card's button stays available, and a refusal, before any
    dialog opens, says to finish or discard the import first.
  - [x] Confirming reads the current history again; if it changed since the
    confirmation was shown, nothing is replaced, the held copy is dropped and
    the card says to choose the backup again (the user chose this over showing
    fresh counts, as the screen leaves no way to change history meanwhile).
  - [x] Closing the app drops the held copy through the same clean-up as
    cancelling, rather than waiting for the next start, through a small plugin
    registered with the app's other state, so `main.rs` stays unchanged.
    Startup still removes a copy a crash left.
  - [x] Confirming closes the store, copies the current database to
    `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder, named
    from the local time the webview sends, checked strictly as a real date and
    time as the backup's date is, renames
    the checked copy over `history.sqlite` and reopens it; any failure before the
    rename leaves the history as it was, and the copy is removed. A current
    history with no accounts gets no safety copy, as the user chose.
  - [x] The screens refresh from the restored history: the History screen, the
    account switcher and the last import.
  - [x] The outcome shows back on the cards, in the Restore card's status line:
    restored, naming the safety copy, or why not. It is designed on the canvas
    first.
  - [x] An end-to-end test restores through the mock, checks the safety copy
    and the restored history, and covers a refusal and a cancellation.
  - Each layer's tests failed first: the session's under-way count against a
    stub, `Database::replace`, the confirmation's outcomes and failures, the
    IPC command, the exit clean-up (through the app's own registration, and
    failing with the plugin removed), then the command client, messages, local
    time, account choices, the flow, both components and the screen. A
    real-file test puts a checked copy in place of a real history and reads both
    with SQLite. The end-to-end test restores a backup missing ten rolls per
    category over the saved history, finds the History screen showing the
    restored count, the safety copy holding the old history and nothing else
    left, and is refused while a review awaits saving. A commit racing a
    confirmation is safe: the store's lock orders them, and either the restore
    finds the history changed or the commit finds its preview stale.
  - Two reviewer agents found that Windows refuses to flush a file opened for
    reading only, so every backup and restore failed there; backup has done so
    since it shipped. Fixed: both flush through a writable handle, the test
    filesystem refuses a read-only flush, which failed six tests first, and the
    Windows CI job runs backup's and restore's real-file tests. Also fixed: a
    choice made while a confirm puts its copy in place is refused, as it would
    copy to the same name (its test fails with the check removed), and the
    checked copy is removed in one place. Restore counting Star Rail alone is
    noted for the second game ([0031](0031-second-game-adapter.md)).
- [x] **Restoring a safety copy** (one PR). Relax the source's data-folder
  guard to protect only the history itself:
  - [x] `choose_restore` refuses `history.sqlite`, compared by its real path,
    and accepts any other file in the data folder, such as a
    `history-before-restore-*.sqlite` safety copy or a migration's
    `history-v<N>.sqlite`. A journal needs no rule, as it fails the check as
    not a database. Backups and safety copies keep the full guard.
  - [x] The refusal's message names the history rather than the data folder:
    “This is your current history, not a backup.”; its failure is now
    `restore_is_history`.
  - [x] An end-to-end test restores a safety copy from the data folder through
    the mock and is refused the history itself.
  - Each layer's tests failed first: the choice refusing the history, also
    through a link to its folder, and accepting a safety copy beside it; the
    message; and the end-to-end test, which restores the first restore's safety
    copy, finds the History screen back at the full count and both safety copies
    kept, and failed against the old guard. A real-file test, which the Windows
    CI job also runs, finds the history through `..`, a link (Unix) and another
    case (Windows), and fails when paths are compared as written. Safety copies
    are named to the second and claimed new, so two restores within one second
    fail the second rather than replace the first.
  - Two reviewer agents found that choosing the held copy itself,
    `restore.sqlite.partial`, emptied it and dropped the confirmation; it is
    now refused as not a backup and stays held (its test failed first).
- [ ] **Migration recovery** (one PR). Ready for the first schema change:
  - [ ] A migration runner: migrations in order, each in one transaction,
    upgrading an older released version on opening; tested with a test-only
    migration against the 1.0.0 fixture.
  - [ ] Each released version's expected schema comes from its migrations run
    in memory from the first release's schema, for the check and restore.
  - [ ] Before upgrading, the database is copied to `history-v<N>.sqlite`; a
    failed migration leaves the original unchanged, and the screens say so and
    name the copy.
  - [ ] CONTRIBUTING's database-schema rules gain the steps for a schema
    change: the migration, its tests against every released fixture, and the
    new release's frozen fixture.
- [ ] **Verification** (one PR, with the user's Windows check):
  - [ ] A round trip through a fresh profile: back up, restore into a new data
    folder, and find the same accounts, rolls and imports.
  - [ ] The 1.0.0 fixture restored as a backup.
  - [ ] The user checks the release executable on Windows: the real save and
    open dialogs, a backup to another folder or drive, a restore into a fresh
    profile, portable mode and the data-folder refusal; the result is recorded
    here and in STATUS.
