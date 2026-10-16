# 0055 — UIGF export

Status: Planned · Milestone 11, Backup, restore and file import

Export the saved Honkai: Star Rail history as a UIGF v4.2 file from the Backup &
Restore screen, so it can be read and moved to other tools. Export stays local
and never makes a network request.

## Requirements

- A save dialog, opened by the Rust side, suggests
  `Astral-Index-UIGF-YYYY-MM-DD.json`. The file holds every saved Star Rail
  account in `hkrpg`, with `info.export_app` `Astral Index`, the app's version
  and `version` `v4.2`.
- Each account carries its UID as text, its time-zone evidence and its records'
  language; an account whose time zone is unknown is named and left out, as UIGF
  requires one.
- Records keep their stored fields and text: IDs as strings, time as the
  server's local time, and a pool ID that was unknown written back as given
  ([decision 0032](../../architecture/decisions/0032-history-file-import-rules.md)).
  Order is deterministic: by account, then category, then time and roll ID.
- The output is validated against the pinned local schema and written to a
  temporary file that is renamed into place; a failure leaves no partial file.
- The screen says the export follows UIGF v4.2, with a link to the standard
  opened in the browser on request, as UIGF's certification asks.

## Tasks

- [ ] **Export.** Serialisation, validation and the atomic write.
- [ ] **Round trips.** Exported files import back with every roll a duplicate,
  including the synthetic StarDB shape and long IDs.
- [ ] **Screen.** The Export UIGF action and the standard's note.
