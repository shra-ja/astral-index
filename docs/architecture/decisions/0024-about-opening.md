# 0024 — About commands and opening

Date: 2026-10-12
Status: Accepted

## Context

The About dialog ([feature 0050](../../product/features/0050-about-and-notices.md))
shows the app's version and data folder, and offers to show the folder in the
system's file manager and to open the repository's issues page in the default
browser. The webview must not be able to open arbitrary paths or addresses
(AGENTS.md: narrowly scoped permissions, no arbitrary filesystem or shell
access), and the native code reaches 100% coverage from unit tests alone, with
OS APIs replaced by test doubles.

Tauri's official opener plugin has three layers: public Rust functions
(`open_url`, `open_path`, `reveal_item_in_dir`) that need no plugin state; IPC
commands, added only when the plugin is registered; and a default permission
that lets the webview open any `http(s)`, `mailto` or `tel` address and reveal
any path. The standalone `opener` crate offers the same OS behaviour: on Linux
the file manager's `org.freedesktop.FileManager1` D-Bus service, falling back
to the desktop portal, and on Windows Explorer's select-item call. Tauri's
testing guide mocks plugins only from the frontend, by intercepting their IPC.

## Decision

- **Three argument-free commands.** `app_info` returns the version, the data
  folder and whether portable mode is on. `reveal_data_folder` shows
  `history.sqlite` selected in its folder, or opens the folder before the file
  exists. `open_issues_page` opens the fixed issues address. The webview chooses
  nothing, so it can open nothing else; a failure is `{"kind":"open_failed"}`
  with neither path nor address.
- **The plugin's functions, not the plugin.** The commands call the opener
  plugin's public functions from the native side. The plugin is not
  registered, so it adds no IPC commands or permissions. Unit tests swap its
  module for a test double at compile time, as they do `std::fs`, so no
  first-party code is excluded from coverage.
- **The data folder crosses IPC.** It is the user's own folder, shown so they
  can find and back up their history; it is never logged. Paths still never
  cross IPC from the webview to native code.
- **The mock debug binary launches nothing.** It records each request, one
  line replacing the last, in `opened.txt` in its data folder; the end-to-end
  tests read that file, and a folder in its place makes opening fail.
- **No hidden network dependency.** The browser, not the app, requests the
  issues page, and only when the user selects it. The app itself still
  contacts only HoYoverse, only on request
  ([decision 0002](0002-user-requested-history-acquisition.md)).

## Alternatives and consequences

- **Register the plugin with a scoped permission:** the frontend would call it
  directly, but the scope would have to hold the data folder's path, which
  differs per machine and in portable mode, and the webview would choose what
  to open. Registering it later stays a small step if the need arises.
- **The `opener` crate:** equivalent behaviour and the same test-double swap,
  but not part of Tauri; the plugin's functions follow the project's Tauri
  conventions.
- **A trait wrapping the plugin:** testable, but adds an indirection that the
  module swap already gives for free.
- Opening the real file manager and browser cannot be checked by automated
  tests; [feature 0038](../../product/features/0038-release-verification.md)
  checks it on each release OS.

## Evidence

- `tauri-plugin-opener` 2.7.1's source: the public functions in `open.rs` and
  `reveal_item_in_dir.rs` use the `open` crate and D-Bus directly, with no
  plugin state; its commands and default permission are separate.
- Unit tests in `src-tauri/src/desktop/about.rs` cover each target, failure
  and the mock's record; the end-to-end tests read the mock's record and check
  the capability grants the three commands.
