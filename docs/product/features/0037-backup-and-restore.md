# 0037 — Backup and restore

Status: In progress · Milestone 11, Backup, restore and file import

A backup file holding the whole history, which a fresh profile can restore,
on a new **Backup & Restore** screen in the sidebar
([decision 0031](../../architecture/decisions/0031-sqlite-snapshot-backups.md)).
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
  constraints or stall the app. The source and the safety copy get the same
  data-folder guard as backups.

  The confirmation then shows the backup's accounts, their roll counts and its
  last import beside the current history's, and says that the current history
  will be kept as a safety copy. On confirming, the current database is copied
  to `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder and the
  checked copy replaces it; the screens then show the restored history. Cancel
  or any failure leaves the current history untouched.
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
  - [ ] Extract one card component from the Import screen's source cards and
    the Backup card, which share their markup and styles, with no change in
    behaviour or look.
  - [ ] Harden the database check for untrusted files: refuse files over
    256 MiB before opening, room for several hundred thousand rolls; compare the schema before the integrity check; open with
    `trusted_schema` off, SQLite's defensive mode, no memory mapping and lowered
    limits; and report not a database, another app's, a newer version and
    damage as distinct errors.
  - [ ] Storage reads a checked file's summary for the confirmation: its
    accounts with their servers and roll counts, and its last import.
  - [ ] A `choose_restore` command opens the open dialog from Rust, refuses a
    source inside the data folder, copies the file into the data folder under a
    temporary name claimed new, checks and migrates the copy, and holds it in
    the session; it returns the backup's summary and the current history's,
    never a path. A `cancel_restore` command removes the held copy. The mock
    debug binary answers the dialog from a file its tests write.
  - [ ] The Restore card on Backup & Restore, and its confirmation, which
    replaces the screen's content, as the Import review does: both summaries
    side by side, Restore and Cancel, and its refusals and failures, by
    keyboard. Leaving the screen keeps the checked copy, so the confirmation is
    still shown on return, until it is confirmed, cancelled or another backup
    chosen. The confirmation is designed on the canvas first.
- [ ] **Restore, replacing** (one PR). Replacing the history with the checked
  copy:
  - [ ] Restore is refused while a retrieval or import is under way.
  - [ ] Confirming closes the store, copies the current database to
    `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder, named
    from the local time the webview sends, checked strictly as a real date and
    time as the backup's date is, renames
    the checked copy over `history.sqlite` and reopens it; any failure before the
    rename leaves the history as it was, and the copy is removed.
  - [ ] The screens refresh from the restored history: the History screen, the
    account switcher and the last import.
  - [ ] The confirmation's outcome: restored, naming the safety copy, or why
    not.
  - [ ] An end-to-end test restores through the mock, checks the safety copy
    and the restored history, and covers a refusal and a cancellation.
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
