# Project status

Updated: 2026-10-20

## Current state

Astral Index is a Tauri 2 desktop app with a Vue webview, released as
[1.0.0](https://github.com/shra-ja/astral-index/releases/tag/v1.0.0) on 2026-10-16. Honkai: Star Rail
history import works end to end; Genshin Impact, with no import yet, shows only in development builds (decision 0026).

- **Retrieval, on request only:** the app finds the warp history link by
  searching the game's cache on Windows or from WSL, or in a cache file the user
  chooses, and checks it with HoYoverse. It then retrieves all six warp
  categories, either new rolls only (stopping at saved rolls) or the full
  history, with progress and Cancel. Nothing is saved until the user reviews it.
- **Review and save:** the review shows the account, new, skipped and
  conflicting rolls per warp, and the period covered. Saving is one transaction;
  failures, cancellations and discards save nothing.
- **Saved history:** the History screen pages through each category's saved
  rolls, with tab counts, a summary strip (rolls, 5★ and 4★ counts with rates,
  stored period), each roll's 5★ pity coloured by soft pity, and rarity, item
  name and date-range filters, as a list, a grid of tiles or icons. It opens on
  the account imported last; with more than one saved account, its header
  switches between them. The Import screen shows the last import. Saved history
  is read from this device only. Themed tooltips name the collapsed sidebar's
  links and explain unavailable controls. The sidebar shows the Astral brand:
  the emblem beside the wordmark, or the emblem alone when collapsed; the
  app's icon is the emblem in its tile. About shows the app's details and its notices.
- **Storage:** one SQLite file in the app's local data folder, or beside the
  executable in portable mode. Accounts and servers are kept apart, and repeated
  or overlapping imports add only new rolls.
- **Quality gates:** 100% per-file coverage for frontend, tooling and Rust unit
  tests, mutation probes for each gate, end-to-end tests against the mock debug
  binary's synthetic HoYoverse, and checks of the docs, icons, README logo and
  app version.
  On Windows, CI also runs the Rust unit tests and backup's and restore's
  real-file tests, and smoke-tests the release
  executable (decision 0029). A frozen 1.0.0 database shows each schema change
  keeps saved history.
- **Backup:** the app-wide Backup & Restore screen saves a checked snapshot of the whole
  history where the user chooses, never inside the data folder, and shows where
  history is stored, as the About dialog does. Restore checks a chosen backup
  as untrusted input, shows its accounts beside the current history's, and
  replaces the history with it, keeping the old one as a safety copy, which can
  itself be restored from the data folder.
- **README:** the logo, badges, and screenshots of the mock's synthetic history,
  retaken with `npm run readme:screenshots`; the features as they are today and
  how to download and run the app.

## In progress

### Data folder (2026-10-21)

`refactor/data-folder`: one source for the data folder, under way.

## Known limitations

- The UI is tested end to end only on Linux (WebKitGTK); Windows CI checks the
  native side. Live retrieval last worked on Windows on 2026-10-15.
- Browsers may flag the unsigned executable until it is signed
  ([0053](../product/features/0053-code-signing.md)).
- No history-file import, Genshin Impact adapter or banner catalogue yet, so
  banners show placeholders and pity has no guarantees or 50/50 outcomes. Pity
  colours use observed rather than published soft pity (decision 0020).
- The date fields use the webview's built-in picker, so they show dates in its
  locale's format (09/28/2026 under WebKitGTK), and WebKitGTK shows today in
  grey in an empty field.
- Server names other than Asia (`prod_official_asia`) have not been seen in a
  real retrieval.

## Next

Next: [0037](../product/features/0037-backup-and-restore.md)'s Migration recovery.

## Keeping this file current

STATUS describes the project as it is now: what works, work in progress, known
limitations and the next concrete task. Keep everything above the History
index under 100 lines, which `npm run docs:check` enforces; the history keeps
the detail.

- **While working:** add a dated section under "In progress", such as
  `### Incremental retrieval (2026-10-03)`, with the outcome, the evidence
  (red/green runs and checks) and any limitations. Keep it short. At handoff,
  leave the section under "In progress"; it is archived after integration.
- **Once integrated:** fold the outcome into "Current state", "Known
  limitations" and "Next", mark the section "Integrated through PR #N", and
  archive it before or with the next piece of work.
- **Archiving:** move whole sections verbatim to
  `history/YYYY-MM-DD-<short-topic>.md`, named by the date of the work and a
  short topic, never a milestone. Append to that day's file if one exists,
  oldest first; otherwise create it with the same header as the others. Change
  only relative link paths. Add the file to the index below.
- **Archived text is never rewritten.** Correct an archived statement in STATUS
  or in the relevant living doc instead.

## History

Oldest first. Each file records what was done, how it was verified and what was
next at the time. Some also hold dated logs moved from TESTING and the HSR
research, under a "From" heading.

- [2026-09-17: shell test evidence](history/2026-09-17-shell-test-evidence.md):
  red/green evidence for the offline shell and its coverage gates.
- [2026-09-21: response parser and review](history/2026-09-21-response-parser-review.md):
  parser TDD, its review and the early plan for the acquisition flow.
- [2026-09-22: test layout](history/2026-09-22-test-layout.md).
- [2026-09-23: SQLite services and overlap measurements](history/2026-09-23-sqlite-services-and-overlap.md):
  storage tests, failure injection and the overlapping-import workload.
- [2026-09-25: shell and storage foundations](history/2026-09-25-shell-and-storage-foundations.md):
  the earlier status log, archived on that date: the offline shell, test and
  coverage gates, CI, the HSR API contract, response parsing and SQLite import
  services.
- [2026-09-25: review remediation](history/2026-09-25-review-remediation.md):
  parser and storage fixes from the milestone 2 review.
- [2026-09-26: cache and log discovery](history/2026-09-26-cache-and-log-discovery.md):
  cache extraction, unit-first backend coverage, player-log and current-user discovery.
- [2026-09-27: extraction commands and transport](history/2026-09-27-extraction-commands-and-transport.md):
  automatic extraction, desktop commands and controls, the cache version window,
  real-installation checks, request building, HTTPS transport and outcomes.
- [2026-09-28: acquisition client](history/2026-09-28-acquisition-client.md):
  auth-key validation, pagination, retries, cancellation, progress, account
  resolution, the review DTO, the session and the local database.
- [2026-09-29: import flow and Vue](history/2026-09-29-import-flow-and-vue.md):
  portable mode, retrieve, commit and discard commands and controls, the data
  folder name, pacing, the collaboration endpoint, the toolchain refresh and the
  move to Vue.
- [2026-09-30: Vue app structure](history/2026-09-30-vue-app-structure.md).
- [2026-10-01: linting and design](history/2026-10-01-linting-and-design.md):
  ESLint and Prettier, and the visual design review.
- [2026-10-02: app shell and mock binary](history/2026-10-02-app-shell-and-mock.md):
  the typeface, minimum window, app shell, import screens, mock debug binary,
  saved rarity counts and the stored history page command.
- [2026-10-03: History screen and refresh](history/2026-10-03-history-screen-and-refresh.md):
  category totals, the History screen, server names, icons, the last import line,
  progress counts and incremental retrieval.
- [2026-10-04: end-to-end verification](history/2026-10-04-end-to-end-verification.md):
  the mock's fresh webview profile, development zoom, and the end-to-end checks
  that closed milestone 7.
- [2026-10-04: probe failure snapshots](history/2026-10-04-probe-failure-snapshots.md):
  the frontend emit flake investigation, the probes' failure snapshots and the
  Markdown checks.
- [2026-10-05: Astral Index rebrand](history/2026-10-05-astral-index-rebrand.md):
  the project cleanup milestone, the rename from Roll Tracker, the reordering
  of milestones 9 to 12 and milestone 9's tasks.
- [2026-10-06: account switching](history/2026-10-06-account-switching.md):
  the History screen's account switcher, summary strip, and rarity, item name
  and date-range filters, the bounded, faster mutation probes, and the Pity
  column.
- [2026-10-07: banner catalogue plan](history/2026-10-07-banner-catalogue-plan.md):
  the standalone downloader and catalogue folder for banner metadata and art,
  history completeness as the user's responsibility, the styled tooltip, and the
  grid and icons layouts.
- [2026-10-09: Astral brand](history/2026-10-09-astral-brand.md): the sidebar
  lockup and decision 0023.
- [2026-10-10: application icon](history/2026-10-10-application-icon.md): the
  generated app icons, their check, the suite discovery probe's timeout,
  feature 0047's close, the size overlay and the review's small-window fix.
- [2026-10-11: History panel fit](history/2026-10-11-history-panel-fit.md): one
  scroll region, content width, sidebar, columns, toolbar, pager, figures.
- [2026-10-12: lockup gap and About](history/2026-10-12-lockup-gap.md).
- [2026-10-13: third-party notices](history/2026-10-13-third-party-notices.md):
  cargo-about and the bundle's report, the notices list, the feature toggles,
  the frontend test clock, the retrieval disclosure and the release checks.
- [2026-10-14: Windows CI](history/2026-10-14-windows-ci.md): the Windows job
  and the CI pipeline's parallel jobs.
- [2026-10-15: Windows smoke test](history/2026-10-15-windows-smoke-test.md):
  decision 0029, the release executable's smoke test, the first-release
  sign-off, the STATUS budget, 0052's Windows polish, the sidebar emblem and
  the version from tags, the release workflow, the launch background, the
  shared Windows build and the CI timeouts.
- [2026-10-16: README presentation](history/2026-10-16-readme-presentation.md):
  the logo, screenshots and README, the mock's year of history, the release
  docs housekeeping, the release notes without a heading, the migration
  fixture, the milestone 11 requirements and backups.
- [2026-10-17: restore breakdown](history/2026-10-17-restore-breakdown.md):
  0037's restore, migration recovery and verification steps.
- [2026-10-18: restore preview](history/2026-10-18-restore-preview.md):
  the shared action card, the hardened check, the Restore card and its
  confirmation.
- [2026-10-19: app-wide screen](history/2026-10-19-app-wide-screen.md):
  Backup & Restore at `/backup`, in the sidebar's Data group.
- [2026-10-20: restore, replacing](history/2026-10-20-restore-replacing.md):
  confirming a restore, its safety copy, the exit clean-up, the Windows
  flush fix and restoring a safety copy.
