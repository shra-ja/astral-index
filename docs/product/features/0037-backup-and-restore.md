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
  checks it as restore would, then renames it into place. A failure leaves no
  partial file and says what went wrong.
- **Restore:** an open dialog, opened by the Rust side, chooses the file. Restore
  checks a copy before anything changes:
  - its size is bounded, and it is a SQLite database with the app's application
    ID;
  - its schema version is a released one no newer than the app's; a newer one is
    refused as "made by a newer version of Astral Index";
  - it passes SQLite's integrity check and has exactly the schema of its
    version;
  - it migrates to the current schema.

  The confirmation then shows the backup's accounts, their roll counts and its
  last import beside the current history's, and says that the current history
  will be kept as a safety copy. On confirming, the current database is copied
  to `history-before-restore-YYYYMMDD-HHMMSS.sqlite` in the data folder and the
  checked copy replaces it; the screens then show the restored history. Cancel
  or any failure leaves the current history untouched.
- **Migration recovery:** before upgrading an older database on opening, the app
  copies it to `history-v<N>.sqlite` in the data folder; a migration runs in one
  transaction, and a failure leaves the original unchanged and names the copy.
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
- [ ] **Restore.** Checking, migrating, the confirmation, the safety copy and
  the replacement, including refusals of newer, corrupt, foreign and unrelated
  files.
- [ ] **Migration recovery.** The pre-migration copy and the failure path, ready
  for the first schema change.
- [ ] **Verification.** Round trips through a fresh profile; the 1.0.0 fixture
  restored as a backup; a Windows check of back up and restore with the release
  executable.
