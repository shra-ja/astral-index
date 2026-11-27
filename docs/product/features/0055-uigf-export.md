# 0055 — UIGF export

Status: In progress · Milestone 11, Backup, restore and file import

Export the saved Honkai: Star Rail history as a UIGF v4.2 file from its own
Export screen, so it can be read and moved to other tools. Export stays local
and never makes a network request.

## Requirements

- The Export screen is one of the selected game's screens, after Import in the
  sidebar's View group, at `/:game/export`
  ([decision 0033](../../architecture/decisions/0033-app-wide-and-per-game-screens.md)).
  A game without an adapter shows the screen with its action unavailable, as
  Import does.
- A save dialog, opened by the Rust side, suggests
  `Astral-Index-UIGF-YYYY-MM-DD.json` from the local date. The file holds every
  saved Star Rail account in `hkrpg`, or the one the user chooses, with
  `info.export_app` `Astral Index`, the app's version and `version` `v4.2`. A
  target in the data folder is refused, as a backup's is.
- An "Account to export" selector, styled like the History screen's account
  switcher, offers All accounts, with their count, or one account, each with its
  server and roll count. With a single saved account it shows that account
  alone, with no menu.
- Each account carries its UID as text, its time-zone evidence and its records'
  language when they all share one of the languages UIGF lists; otherwise the
  account has no `lang`, which UIGF allows, and each record keeps its own. An
  account whose time zone is unknown is named and left out, as UIGF requires
  one. A UID among the exported accounts more than once, which only synthetic
  histories hold, is named and left out, as UIGF readers refuse a repeated UID;
  each of its accounts can still be exported alone.
- Records keep their stored fields and text: IDs as strings and time as the
  server's local time. UIGF requires a pool ID, so rolls saved without one are
  left out, and the export says how many, until
  [pool ID completion](0057-pool-id-completion.md) fills them
  ([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
  Order is deterministic: by account, then category, then time and roll ID,
  with roll IDs compared as numbers (by length, then text), never converted.
- An export left with no rolls to write is refused before the save dialog
  opens, saying what was left out and why.
- The app validates the output against the pinned local schema, bundled with
  it, before writing; it is written to a temporary file that is renamed into
  place, so a failure leaves no partial file.
- The screen says the export follows UIGF v4.2, with a link to the standard
  opened in the browser on request, as UIGF's certification asks.

## Tasks

One PR each, in order. The shared account selector and the screen follow a
mockup of the Export screen approved on the canvas first: the account
selector, the Export UIGF file action, the outcome with what was left out, the
standard's note, and the empty and error states.

- [x] **Export read.** Storage reads every saved Star Rail account, or the one
  chosen, with its time zone and its rolls in export order, in one read, so the
  accounts come from one moment of the history.
- [x] **UIGF writing.** `uigf` gains a writer beside its reader, without file
  access: the v4.2 document with `info` (the export time passed in), each
  account's UID as text, time zone and listed shared language, and records with
  their stored fields. It reports what it left out: rolls without a pool ID per
  account, and accounts without a time zone or with a repeated UID. Tests check
  its outputs against the pinned schema and read them back with `uigf::read`.
- [x] **Schema notices.** The schema and its licence move out of the test
  fixtures to where the app bundles them, with the fixtures' README updated,
  and the third-party notices gain bundled data files, listing the schema with
  its licence and source, so no build ships it without its notice.
- [x] **Validated export.** `file_export`, beside `file_import`, joins the
  export read and the writer, refuses an export with no rolls, and validates
  the document at runtime against the schema it is given, so a test can hand it
  a stricter one to reach the refusal. `jsonschema` becomes a runtime
  dependency, with the `Cargo.toml` comment updated, and a decision records
  validating at runtime.
- [x] **Round trips.** Integration tests export synthetic histories through
  `file_export` and import each account back through file import: every roll a
  duplicate, 19-digit IDs unchanged, accounts kept apart, rolls without a pool
  ID counted and left out, and a repeated UID left out of All accounts but
  exported alone.
- [x] **One history read.** A refactor with no change in behaviour: storage's
  test-only `history` read is removed, and its tests read through `histories`
  with the account chosen, allowing for its numeric order and for an account
  without rolls being left out.
- [x] **Shared file writing.** A refactor with no change in behaviour: backup's
  temporary-file write (claim a `.partial` name, write, flush, rename, remove it
  on failure), with `publish` (renamed `flush_and_rename`), `real` and `in_data_folder`, moves into
  `desktop/replacing_file.rs`. `ReplacingFile` claims the temporary file, is
  written through its path and published, and removes the file when dropped
  unpublished, so backup's asynchronous, checked SQLite snapshot and export's
  bytes both fit with their own failures; backup and restore use it, the kept
  copy's naming shares its `first_unused` loop, and its tests move with it.
- [x] **Shared opener.** A refactor with no change in behaviour: the opening of
  a file, a folder or the issues page (the opener, its targets and the mock's
  record) moves out of the About dialog's module into `desktop/opener.rs`, held
  as its own state, so the export command can open the standard without
  reaching into About.
- [ ] **Export command.** `export_uigf` takes All accounts or one UID and
  server, builds the export through `file_export`, then opens the save dialog
  from Rust with the suggested name (the mock answers it from its data folder),
  refuses the data folder, writes through the shared file writing and returns
  the file's name and what was left out, never logging an outcome, as it names
  accounts. A roll payload that is not JSON fails the history read as a
  database error, not damaged history, as the read sorts by its fields; the
  command's messages take that into account. An `open_uigf_standard` command opens
  the standard's fixed URL, as `open_issues_page` does. Narrow permissions, the
  command manifest, the mock's scenarios and a real-file test for Windows CI.
- [ ] **Shared account selector.** A refactor with no change in behaviour: the
  History screen's account switcher, its single-account chip and the choice
  between them move to the shared components unchanged.
- [ ] **Screen.** The route and sidebar link, the selector's All accounts
  option, test first, a `useExport` composable and small presentational
  components, the webview's types and messages, keyboard operation, and an
  end-to-end test that exports through the mock and checks the file; then the
  architecture, README and feature docs.
- [ ] **Windows check.** The user exports with the release executable on
  Windows, imports the file into another UIGF tool, and imports it back into a
  fresh profile.
