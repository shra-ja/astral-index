# 0050 — About and notices

Status: Planned · Milestone 10, Release readiness

Give the app an About screen carrying what a distributed copy must or should
show: its version, its MIT licence, the non-affiliation disclaimer, where its
data is kept, how to report a problem, and the licences of every third-party
component it ships. Today the licence and disclaimer live only in the
repository's README and LICENSE, which installed copies do not include, and the
version appears nowhere in the app. The MIT, Apache-2.0 and OFL licences of
the bundled crates, npm packages and font require their notices to travel with
the binaries.

## Tasks

Each task is one PR, in this order, test first.

- [ ] Add the About screen.
  - An "About" link, with an icon, at the foot of the sidebar's navigation,
    labelled and tooltipped like the other links when the sidebar is
    collapsed. The screen has its own route outside the game routes; the
    sidebar keeps the last game selected, and its screen links return to that
    game.
  - **Version:** the app's version from the native side, one source of truth.
    A check in `npm run check` fails when the versions in `package.json`,
    `src-ui/package.json`, `src-tauri/Cargo.toml` and
    `src-tauri/tauri.conf.json` differ.
  - **Licence:** the MIT notice with its copyright line, and that the software
    is provided as is, without warranty.
  - **Disclaimer:** Astral Index is not affiliated with or endorsed by
    HoYoverse; game names and trademarks belong to their owners. History is
    retrieved only on request and only from HoYoverse's history service, with
    no telemetry. Statistics are calculated from the saved rolls, and keeping
    history complete is the user's responsibility
    ([decision 0021](../../architecture/decisions/0021-history-completeness.md)).
  - **Data folder:** the folder holding `history.sqlite`, and whether portable
    mode is on, as selectable text, with a line saying that copying the file
    while the app is closed backs up the history. No "open folder" or
    clipboard control: either would need a further native permission.
  - **Problem reports:** the repository's issues address as selectable text,
    not a link, so the screen opens nothing on the network. Reports should
    give the version and operating system, and never include the warp history
    link, an account ID or the database.
  - One narrowly scoped command returns the version, data folder and portable
    flag, with its permission listed in the main capability; IPC tests cover
    its malformed calls. End-to-end checks cover the screen, keyboard
    operation and the width sweep at the release window sizes.
- [ ] Generate and check the third-party notices.
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
- [ ] Show the third-party notices on the About screen: a list of components
  by name, version and licence, each licence text expandable, readable by
  keyboard and screen reader, and fitting every window size. The notices are
  bundled with the frontend; the screen loads nothing at run time.
