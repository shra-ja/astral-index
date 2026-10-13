# 0050 — About and notices

Status: In progress · Milestone 10, Release readiness

Give the app an About dialog carrying what a distributed copy must or should
show: its version, its MIT licence, the non-affiliation disclaimer, where its
data is kept, how to report a problem, and the licences of every third-party
component it ships. Today the licence and disclaimer live only in the
repository's README and LICENSE, which installed copies do not include, and the
version appears nowhere in the app. The MIT, Apache-2.0 and OFL licences of
the bundled crates, npm packages and font require their notices to travel with
the binaries.

## Tasks

Each task is one PR, in this order, test first.

- [x] Add the About commands, on the native side only.
  - `app_info` returns the app's version, the data folder in use and whether
    portable mode is on. The version comes from the native side, one source of
    truth, and a check in `npm run check` fails when the versions in
    `package.json`, `src-ui/package.json`, `src-tauri/Cargo.toml` and
    `src-tauri/tauri.conf.json` differ.
  - `reveal_data_folder` shows `history.sqlite` selected in the system file
    manager, or opens the data folder when the file does not exist yet.
    `open_issues_page` opens the repository's fixed issues address in the
    default browser. Both take no arguments, so the webview can open nothing
    else, and a failure is reported without the path or address.
  - Opening uses the official opener plugin's functions, called only from the
    native side; the plugin itself is not registered, so it adds no IPC
    commands or permissions. Unit tests swap its module for a test double, as
    they do the filesystem. The browser, not the app, makes the request, and
    only on the user's click.
  - The mock debug binary never launches anything: it records each request in
    a file in its data folder, which the end-to-end tests read.
  - Each command's permission is listed in the main capability, and IPC tests
    call each one. Record a decision for the opener design: argument-free
    commands, the plugin's functions without its IPC, and why a user-selected
    link to the issues page is not a hidden network dependency.
- [x] Add the About dialog.
  - An "About" button, with an icon, at the foot of the sidebar's navigation
    above the device note, labelled and tooltipped like the links when the
    sidebar is collapsed. It opens a modal dialog over the current screen
    (the native `<dialog>`, closed with Close or Esc, returning focus to the
    button); About has no route.
  - **Lockup:** the open lockup (the emblem without its tile) beside the
    wordmark, centred, at H 40 with the brand's regular files, shrinking to
    fit narrow windows but never below H 26. Below it, centred, the version
    and "MIT License".
  - **Disclaimer:** Astral Index is not affiliated with or endorsed by
    HoYoverse; game names and trademarks belong to their owners. History is
    retrieved only on request and only from HoYoverse's history service, with
    no telemetry. Statistics are calculated from saved rolls, and keeping
    history complete is the user's responsibility
    ([decision 0021](../../architecture/decisions/0021-history-completeness.md)).
  - **Saved History:** the data folder as selectable text, whether portable
    mode is on, a Show in Folder button and a line saying that copying
    `history.sqlite` while the app is closed backs up the history. If opening
    fails, the dialog says so; the path stays visible.
  - **Problem Reports:** an Issues Page button; reports should give the
    version and operating system, and never include the warp history link, an
    account ID or the database.
  - **Licence Text** and **Third-Party Notices** buttons swap the dialog to a
    view with Back and Close: the full MIT licence, and the notices (a
    placeholder until the next tasks).
  - Copy the brand's regular dark-background wordmark into
    `src-ui/src/assets/brand/` as supplied, and amend
    [decision 0023](../../architecture/decisions/0023-astral-brand.md) for the
    regular set and the open lockup in the dialog.
  - End-to-end checks cover both openings and a failed one, keyboard
    operation and Esc, and the width sweep at the release window sizes.
    Opening the real file manager and browser is checked natively in
    [0038](0038-release-verification.md).
- [x] Generate and check the third-party notices.
  - A generator in `tooling/` builds the notices from what the release build
    ships: Rust crates in the release dependency graph, the npm packages the
    frontend bundle contains, and the bundled font files. Each entry gives the
    component, version, licence identifier and full licence text, with
    identical texts shared.
  - The generator fails closed: a component without a licence text, or with a
    licence outside an accepted list (for example MIT, Apache-2.0, BSD,
    ISC, Zlib, Unicode-3.0 and OFL-1.1), fails the build and `npm run check`.
    A mutation probe proves the gate fails.
  - Record a decision choosing the tooling (for example cargo-about for the
    crates and the bundler's licence report for the npm packages) and the
    accepted licence list, and update DEVELOPMENT if a tool is added.
  - The generator also writes a plain-text `THIRD-PARTY-NOTICES` file for
    [0039](0039-distribution.md) to ship beside the app.
- [ ] Show the third-party notices in the About dialog's notices view, the
  way Chrome's credits page does: every component by name, version and
  licence, grouped by origin (Rust crates, frontend packages, the typeface)
  with a count per group, each licence text expandable and rendered only once
  expanded. Readable by keyboard and screen reader, and fitting every window
  size. No filter or search: the view exists to meet the licences'
  requirement, and the work should stay minimal. The notices are bundled with
  the frontend; the dialog loads nothing at run time.
  - The notices file is generated by every build and not committed, so the
    view loads it lazily, keeping it out of the startup bundle, through a
    lookup that finds nothing rather than failing when the file is missing.
    In development, where `tauri dev` does not build, a missing file shows a
    note that builds generate the notices (`npm run notices`).
  - Unit tests use a small synthetic notices file, never the generated one;
    the mock binary's end-to-end check, a production build, finds the list.
