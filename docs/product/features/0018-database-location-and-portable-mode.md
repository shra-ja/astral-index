# 0018 — Database location and portable mode

Status: Done · Milestone 5, Import review and save
Decisions: [0009](../../architecture/decisions/0009-local-database-location.md), [0010](../../architecture/decisions/0010-portable-mode.md)

Keep the database in the app's local data folder, or beside the executable in
portable mode.

## Tasks

- [x] Open the local database in the app's local data folder on first use, running
  SQLite calls off the async workers; record the location in a decision.
- [x] Add a portable mode that keeps the database next to the application
  executable, with a seamless switch between it and the local app data folder
  (for example, detected from the executable's folder rather than a setting),
  and a safe way to move existing history between the two locations. Moved up
  from the deferred list at the user's request. A `data` folder beside the
  executable switches it on; moving history is a documented manual copy.
- [x] Name the app's data folder `Roll-Tracker` (`roll-tracker` on Linux)
  rather than the bundle identifier, and keep the webview profile in it, or in
  `data` in portable mode.
