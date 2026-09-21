# Roadmap

Milestones are ordered by dependency. Check items only after their acceptance
criteria are demonstrated; record results and limitations in `STATUS.md`.
Every code milestone follows `../CONTRIBUTING.md`: a short-lived task branch,
red-green-refactor, and passing full tests and 100% coverage before integration.

## 0 — Project context

- [x] Document product intent, agent instructions, boundaries, and import risks.
- [x] Reserve frontend, native backend, and fixture directories.
- [x] Define mandatory TDD, 100% coverage, and trunk-based development conventions.
- [x] Initialize Git with `main` as the trunk and configure the GitHub remote.
- [x] Establish the authorized documentation baseline commit.

## 1 — Runnable offline shell

- [x] Select and record vanilla TypeScript/Vite/npm, Tauri 2, and Ubuntu 24.04.
- [x] Create `feat/offline-shell` from the authorized baseline before adding code.
- [x] Pin asdf Node/Rust toolchains and exact frontend/Rust dependencies.
- [x] Establish frontend/tooling V8 coverage and native LLVM branch instrumentation,
  including `build.rs`; enforce 100% per-file metrics and source inventory.
- [x] Prove gate failures for unexecuted files, missed branches and missing reports.
- [x] Add CI running the same local checks and uploading coverage/screenshots.
- [x] Scaffold Tauri with bundled assets and restrictive production CSP.
- [x] Use red-green-refactor for an accessible empty state with game selection.
- [x] Document and run setup, tests, coverage, lint/type and production build commands.
- [x] Launch and exercise the native shell in an isolated network namespace.
- [x] Commit the milestone with Conventional Commits and publish
  [PR #1](https://github.com/shra-ja/roll-tracker/pull/1).
- [x] Obtain a passing hosted **Tests and 100% coverage** run.
- [x] Configure **Tests and 100% coverage** as a required check on protected `main`.

Milestone 1 implementation and validation are complete on Ubuntu 24.04 x86_64.
The user confirmed hosted CI passed and required checks were configured on
2026-09-19. Windows/macOS and installer packaging remain untested and are covered
by milestone 6 release validation. Review, integration and branch deletion follow
the standard workflow in `../CONTRIBUTING.md`.

## 2 — HSR API import foundations

Honkai: Star Rail API history import is the first feature to implement after the
shell. This milestone establishes its backend foundations; milestone 3 completes
the user-facing acquisition and import flow. Standalone history-file import is
not a prerequisite.

[API research](HSR-API-RESEARCH.md) records request extraction and a working
nine-field query. Advancing `end_id` and `page` reproduced 50 records across five
pages. Full response semantics, identity, timezone, pagination edge cases, and
completeness still need verification.

- [ ] Verify the HSR API response format, record identity, account/server context,
  timestamp/timezone semantics, and pagination termination/error behavior.
- [x] Create synthetic response fixtures and request mocks; keep all automated
  tests local and self-contained, with no live API calls or player credentials.
- [x] Implement the domain model and response parser with test-first validation.
  The initial model validates individual pages and preserves optional context;
  it is not yet a resolved account or transactional import model. Request mocks
  are scripted parser-boundary responses, not tests of a production HTTP client.
  See [response review](HSR-API-RESEARCH.md#response-foundation-review-2026-09-21)
  for policy and remaining external-verification limits.
- [ ] Select and implement the local database, initial migration, and shared
  preview/transactional import services.
- [ ] Verify persistence, repeat/overlap imports, validation failures, migration
  safety, and account isolation at the service level.

Done when synthetic HSR API responses can be validated, previewed, and committed
through tested services without duplicate records or partial writes. This is a
foundation for the first API-import feature, not a separate file-import release.

## 3 — First user-requested API history import

Moved forward from former milestone 5; depends on milestone 2's parser and
transactional import services.

- [ ] Verify HSR cache/request discovery on the initial supported OS and record
  supported and unsupported sources with evidence.
- [ ] Implement read-only manual cache/game-data selection and request extraction;
  add automatic discovery where verified. A selected cache supplies request
  context, not a standalone roll-history export.
- [ ] Implement user-initiated native HoYoverse fetching with bounded cursor
  pagination, cancellation, and network/authentication error handling, using
  mocked requests in automated tests. No background or automatic fetching.
- [ ] Connect acquisition to import preview, atomic commit, and history display.
- [ ] Verify the complete flow, restart persistence, repeat/overlap fetches,
  account isolation, cancellation, and failure recovery using local test data.

Done when an explicit user request retrieves HSR history through the API,
previews and commits it locally, and displays it after restart without duplicate
records. Failures preserve existing data; stored-history operations never trigger
acquisition. This is the first implemented import feature. See
[decision 0002](decisions/0002-user-requested-history-acquisition.md).

## 4 — Additional import sources, multi-game history and statistics

- [ ] Add supported history-file selection and parsing through the shared import
  pipeline, independently verifying each file format.
- [ ] Add the second game's independently verified adapter, acquisition sources,
  response/file fixtures, and request mocks.
- [ ] Add account/server switching, filters, totals, and rarity breakdowns.
- [ ] Implement verified banner grouping and coverage-aware pity calculations.

Done when both games coexist without shared identity/rule assumptions, supported
history files reuse the import pipeline, and partial histories display appropriate
uncertainty.

## 5 — Backup and restore

- [ ] Define a versioned export format and validate imports of backups.
- [ ] Implement backup, restore, and migration recovery behavior.
- [ ] Verify round trips and corrupted/unsupported backup handling.

Done when a fresh profile can recover the same records and metadata from a backup.

## 6 — Release readiness

- [ ] Check accessibility, large histories, native permissions, and bundled resources.
- [ ] Verify local workflows, requested fetching, network failures, upgrades, backups,
  and packaging on each release OS.
- [ ] Choose license/distribution, document supported formats, and provide recovery help.
