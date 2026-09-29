# 0010 — Portable mode

Date: 2026-09-29
Status: Accepted; extends [decision 0009](0009-local-database-location.md).

## Context

The history database lives in the local app data folder (decision 0009). The user
also wants a portable mode that keeps the database next to the application, for
example to run the app from a USB drive or a synced folder they control, and to
switch between the two seamlessly, without a setting.

## Decision

A folder named `data` beside the executable switches on portable mode. At startup,
`desktop::register` passes the executable's path from `std::env::current_exe` to
`database::location`, which returns that `data` folder if it exists as a folder,
and the local app data folder otherwise. The database file is still
`history.sqlite`, now inside `data`. Creating or removing the folder switches modes
on the next start. VS Code's portable mode uses the same convention.

The user chose these rules:

- **Detection:** the `data` folder, rather than a marker file or an existing
  database beside the executable.
- **Both locations have a database:** the portable one is used silently. Nothing
  is merged, deleted or copied.
- **Moving history:** a documented manual copy for now (see the README). An
  in-app offer to copy history across on the first portable start is deferred.

A `data` path that is a file, not a folder, does not switch modes. If the `data`
folder exists but cannot hold the database, for example on read-only media, opening
fails with the storage `Database` error. There is no fallback to the local folder,
which would silently split history between two databases.

## Alternatives and consequences

- **A marker file** is easy to toggle, but is an invisible convention.
- **An existing database beside the executable** gives no way to start portable
  mode except by copying a database there first.
- **An in-app move with verification**, or an offer on the first portable start,
  is safer than a manual copy but needs UI; the offer is deferred on the roadmap.
- Installer-based builds (Program Files, AppImage, macOS `.app` bundles) keep the
  executable where user data does not belong; portable mode is meant for the
  unpacked executable. Packaging is milestone 6 work.
- The app does not show which location it uses. A user who creates `data` beside
  an executable that already has local history will start with an empty portable
  history until they copy the database across.

## Evidence

Unit tests, with the filesystem double, cover a `data` folder, a missing one, a
file named `data`, an unknown executable and an executable path with no folder.
The registration test still gets the local folder, since no `data` folder sits
beside the test binary. An integration test creates a real `data` folder beside a
synthetic executable path, opens the database there and confirms the local folder
is never created.
