# Project status

Updated: 2026-10-05

## Current state

Astral Index is a Tauri 2 desktop app with a Vue webview. Honkai: Star Rail
history import works end to end; Genshin Impact has its screens but no import yet.

- **Retrieval, on request only:** the app finds the warp history link by
  searching the game's cache on Windows or from WSL, or in a cache file the user
  chooses, and checks it with HoYoverse. It then retrieves all six warp
  categories, either new rolls only (stopping at saved rolls) or the full
  history, with progress and Cancel. Nothing is saved until the user reviews it.
- **Review and save:** the review shows the account, new, skipped and
  conflicting rolls per warp, and the period covered. Saving is one transaction;
  failures, cancellations and discards save nothing.
- **Saved history:** the History screen pages through each category's saved
  rolls for the account imported last, with tab counts. The Import screen shows
  the last import. Saved history is read from this device only.
- **Storage:** one SQLite file in the app's local data folder, or beside the
  executable in portable mode. Accounts and servers are kept apart, and repeated
  or overlapping imports add only new rolls.
- **Quality gates:** 100% per-file coverage for frontend, tooling and Rust unit
  tests, mutation probes that prove each gate fails, and end-to-end tests that
  drive the app against a synthetic HoYoverse (the mock debug binary). The docs
  are checked too: links and anchors resolve, every doc is reachable from
  `AGENTS.md`, STATUS stays within 150 lines, and markdownlint checks structure.

## In progress

### Milestone reordering (2026-10-05)

On `docs/reorder-milestones`, docs only. The first release now covers Star Rail
only (decision 0018). Milestone 9, History browsing and statistics, holds account
switching and filters, banner metadata, pity and the grid layouts; 10 is release
readiness; 11 is backup, restore and file import; 12 is Genshin Impact and item
art. The product brief lists backup, file import and Genshin Impact under later
releases, and backup's per-OS check moved from 0038 to 0037. Evidence:
`npm run docs:check` and markdownlint pass.

## Known limitations

- The current build has not been validated natively on Windows; development and
  CI run on Linux and WSL. Live retrieval was last tried on Windows with PR #37.
- No history-file import, Genshin Impact adapter, account switching, filters,
  statistics or pity yet.
- Server names other than Asia (`prod_official_asia`) have not been seen in a
  real retrieval.
- An intermittent frontend test failure has been seen only inside the
  suite-discovery mutation probe; a failing probe now saves a snapshot to
  `test-results/probe-failures/`. See
  [probe failure snapshots](history/2026-10-04-probe-failure-snapshots.md).

## Next

If the probe flake recurs, read its snapshot before rerunning. Next, propose
milestone 9's PR split and break its features into tasks on ROADMAP, starting
with account and server switching and filters on the History screen (0032).
Native Windows validation of the current build belongs to milestone 10.

## Keeping this file current

STATUS describes the project as it is now: what works, work in progress, known
limitations and the next concrete task. Keep it under about 150 lines; the
history keeps the detail.

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
  the project cleanup milestone and the rename from Roll Tracker.
