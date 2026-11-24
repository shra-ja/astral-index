# 0055 — UIGF export

Status: Planned · Milestone 11, Backup, restore and file import

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
  language when they all share one; otherwise the account has no `lang`, which
  UIGF allows, and each record keeps its own. An account whose time zone is
  unknown is named and left out, as UIGF requires one.
- Records keep their stored fields and text: IDs as strings and time as the
  server's local time. UIGF requires a pool ID, so rolls saved without one are
  left out, and the export says how many, until
  [pool ID completion](0057-pool-id-completion.md) fills them
  ([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
  Order is deterministic: by account, then category, then time and roll ID,
  with roll IDs compared as numbers (by length, then text), never converted.
- The app validates the output against the pinned local schema, bundled with
  it, before writing; it is written to a temporary file that is renamed into
  place, so a failure leaves no partial file.
- The screen says the export follows UIGF v4.2, with a link to the standard
  opened in the browser on request, as UIGF's certification asks.

## Tasks

One PR each, in order. The last two follow a mockup of the Export screen
approved on the canvas first: the account selector, the Export UIGF file
action, the outcome with what was left out, the standard's note, and the empty
and error states.

- [ ] **Shared atomic write.** A refactor with no change in behaviour: backup's
  temporary-file write (claim a `.partial` name, flush, rename, remove it on
  failure) moves into its own module, named for its purpose, taking the failure
  to report from its caller; backup uses it, and its tests move with it.
- [ ] **Export read.** Storage reads every saved Star Rail account, or the one
  chosen, with its time zone and its rolls in export order, in one read, so the
  accounts come from one moment of the history.
- [ ] **UIGF writing.** `uigf` gains a writer beside its reader, without file
  access: the v4.2 document with `info` (the export time passed in), each
  account's UID as text, time zone and shared language, and records with their
  stored fields; it reports the rolls left out without a pool ID per account and
  the accounts left out without a time zone. `jsonschema` becomes a runtime
  dependency with the pinned schema bundled, the third-party notices follow,
  and a decision records validating at runtime. Tests check outputs against the
  schema and read them back with `uigf::read`.
- [ ] **Round trips.** Integration tests export synthetic histories and import
  each account back through file import: every roll a duplicate, 19-digit IDs
  unchanged, accounts kept apart, and rolls without a pool ID counted and left
  out.
- [ ] **Export command.** `export_uigf` takes All accounts or one UID and
  server, opens the save dialog from Rust with the suggested name (the mock
  answers it from its data folder), refuses the data folder, writes through the
  shared atomic write and returns the file's name and what was left out; an
  `open_uigf_standard` command opens the standard's fixed URL, as
  `open_issues_page` does. Narrow permissions, the command manifest, the mock's
  scenarios and a real-file test for Windows CI.
- [ ] **Shared account selector.** A refactor: the History screen's account
  switcher becomes a shared component that can also offer All accounts and
  each account's roll count, keeping the History screen as it is.
- [ ] **Screen.** The route and sidebar link, a `useExport` composable and
  small presentational components, the webview's types and messages, keyboard
  operation, and an end-to-end test that exports through the mock and checks
  the file; then the architecture, README and feature docs.
- [ ] **Windows check.** The user exports with the release executable on
  Windows, imports the file into another UIGF tool, and imports it back into a
  fresh profile.
