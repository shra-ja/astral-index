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
pages. The [initial API contract](HSR-API-CONTRACT.md) now records observed fields,
accepted assumptions and the observed expired-key response. Additional external
verification does not block this milestone under the user's agreed scope.

- [x] Formalise the initial HSR API contract: observed fields, banner codes,
  stable-ID policy, auth-key account selection, server-local timestamps, tested
  cursor pagination and bounded errors/retries, including `-101` for an expired
  auth key. Adopt the user's assumptions and defer formal account/server verification to
  the end of milestone 3. This is an accepted contract, not proof of all live behaviour.
- [x] Create synthetic response fixtures and request mocks; keep all automated
  tests local and self-contained, with no live API calls or player credentials.
- [x] Implement the domain model and response parser with test-first validation.
  The initial model validates individual pages and preserves optional context;
  it is not yet a resolved account or transactional import model. Request mocks
  are scripted parser-boundary responses, not tests of a production HTTP client.
  See [response review](HSR-API-RESEARCH.md#response-foundation-review-2026-09-21)
  for policy and remaining external-verification limits.
- [x] Select and implement the local database, initial migration, and shared
  preview/transactional import services.
- [x] Verify persistence, repeat/overlap imports, validation failures, migration
  safety, and account isolation at the service level.
- [x] Optimize persistence for the baseline workload: repeatedly importing the
  last 12 months of history at varying points throughout the year, with substantial
  overlap. Keep each scoped roll once and retain compact import summaries with
  time, account/server, source/adapter, and new/duplicate/conflict counts.
- [x] Stop retaining full response snapshots by default. Replace per-import
  associations for unchanged rolls with first-import provenance; an entirely
  overlapping successful import should add only a compact summary, while an
  import with new rolls adds those rolls and their first-import provenance.
- [x] Preserve conflict validation for existing IDs, account/server isolation,
  immutable previews and atomic rollback under the compact storage model. Test
  schema initialization/rollback and rejection of obsolete development schemas.
  Document the deliberate lack of exact historical import reconstruction and
  the allowed pre-release compatibility break.
- [x] Add local synthetic performance and storage-growth tests for thousands of
  records across many rolling 12-month imports, including complete overlap,
  partial overlap, new records and conflicts. Record import time, peak memory
  and database growth; verify duplicate-only imports do not copy roll payloads
  or add per-roll associations again.

The native service now uses SQLite/rusqlite with schema version 2, immutable
previews, exact-ID deduplication, conflict rejection and compact first-import provenance.
Real-file and injected-failure tests cover restart, isolation, stale previews and
rollback. The contract task is complete under the accepted assumptions; synthetic service
tests do not establish universal endpoint behaviour or prove lifetime retention.
See [decision 0003](decisions/0003-sqlite-import-foundations.md).
The sole initial schema creates compact storage directly, without page snapshots
or repeated associations. Obsolete pre-release schemas are rejected, not upgraded. See [decision 0004](decisions/0004-compact-import-provenance.md)
and the synthetic overlap measurements in [testing](TESTING.md#overlapping-imports-and-schema-2-2026-09-23).

Done when synthetic HSR API responses can be validated, previewed, and committed
through tested services without duplicate records or partial writes, and repeated
overlapping imports retain only new rolls plus compact import summaries and
first-import provenance, with measured performance and storage-growth evidence. This is a
foundation for the first API-import feature, not a separate file-import release.

## 3 — First user-requested API history import

Moved forward from former milestone 5; depends on milestone 2's parser and
transactional import services.

Each unchecked sub-step is one deliverable increment on its own short-lived
branch. Check a parent item only when all of its steps are checked. Steps run in
the order listed.

- [x] Connect user-requested automatic discovery and extraction, locating `data_2`
  internally in the supported cache directory. If discovery fails, accept a
  user-provided cache file as the alternative. Do not require users to select a
  discovered cache or game-data directory. Cache files supply request context,
  not standalone roll-history exports.
  - [x] Read a selected cache file within size bounds without modifying it,
    rejecting non-regular files. Extract the encoded request-context fields,
    validate the exact endpoint, deduplicate contexts in first-seen order and
    redact credentials from debug output (`55e09f3`, `a0eb47f`).
  - [x] Resolve versioned `webCaches` folders in a game-data directory, latest
    first (`55e09f3`). Narrowed after WSL verification to the two newest version
    folders, without the unversioned layout.
  - [x] Read game-data directories from bounded `Player.log` and `Player-prev.log`
    headers with independent outcomes and explicit WSL drive mapping (`0fc2cc7`).
  - [x] Resolve the current user's roaming AppData on native Windows and on WSL
    through bounded, killable helpers, without profile scans
    ([decision 0005](decisions/0005-current-user-windows-discovery.md), `4b360f2`).
  - [x] Compose current-user discovery, `data_2` resolution and extraction into
    one native automatic-extraction service, tested with mocked OS and file APIs.
    Assume a single cache file holds requests for one account, and return its
    contexts in reverse file order.
  - [x] Expose automatic extraction and the user-provided cache file fallback
    through narrow Tauri commands and permissions. Keep paths native-only. Hold
    extracted auth keys only in short-lived native memory, never persisted or
    sent to the frontend.
  - [x] Add accessible HSR controls for both actions, with readable empty,
    failure and fallback states.
- [x] Verify HSR cache/request discovery for Windows installations, from both
  Windows and WSL, and record
  supported and unsupported sources with evidence.
  - [x] Verify automatic extraction against a real installation from native Windows.
  - [x] Verify automatic extraction against a real installation from WSL.
  - [x] Record supported and unsupported sources with evidence
    ([HSR API research](HSR-API-RESEARCH.md#supported-and-unsupported-extraction-sources-2026-09-27)).
- [ ] Implement the [initial API contract](HSR-API-CONTRACT.md) in a user-initiated
  native client: single tested endpoint, 1000-record default pages, cursor pagination,
  cancellation and actionable failures. Use one retry
  per transiently failed request, at most two extra attempts per acquisition, and
  synthetic request mocks. No background or automatic fetching.
  - [ ] Build single-endpoint requests from an extracted context: fixed
    authentication, language and size, 1000-record default pages, and page and
    cursor parameters.
  - [ ] Add a mockable transport with finite timeouts that enforces the 2 MiB
    response bound while receiving data. Record the HTTP dependency choice.
  - [ ] Classify outcomes as actionable failures: `-101` expired key, other
    nonzero codes, rate limits, malformed responses, and transient connection
    failures or HTTP 5xx. Do not expose raw messages or payloads.
  - [ ] Validate at most five extracted contexts, in reverse file order, by
    sending each cached request unchanged, and use the first whose auth key
    works. If none works, stop with an actionable error
    ([auth-key validation](HSR-API-CONTRACT.md#auth-key-validation)).
  - [ ] Paginate each category by cursor. Stop on a short page, advance on a full
    page, reject repeated cursors and cycles, and enforce the 16 MiB batch bound.
    Fetch all six known categories sequentially.
  - [ ] Apply the retry budget: one retry per transiently failed request after a
    short bounded delay, and at most two extra attempts per acquisition.
  - [ ] Support cancellation that stops further requests and writes nothing.
- [ ] Connect acquisition to import preview, atomic commit, and history display.
  Expose a narrow native review DTO with validated account/server/context, records
  and conflict locations, plus safe page/record indices for validation failures.
  Do not reparse private source bytes in the frontend or expose credentials/raw
  payloads in diagnostics.
  - [ ] Build the native review DTO from an acquisition preview.
  - [ ] Expose acquisition-to-preview, commit and cancel through narrow Tauri
    commands. Clear the auth key from memory when the import completes, fails
    or is cancelled.
  - [ ] Add accessible review and commit controls for the preview.
  - [ ] Display stored history from local storage without triggering acquisition.
- [ ] Verify the complete flow, restart persistence, repeat/overlap fetches,
  account isolation, cancellation, and failure recovery using local test data.
  - [ ] Verify request, preview, commit, restart and display end to end with
    synthetic request mocks.
  - [ ] Verify that repeat and overlapping fetches, account isolation,
    cancellation and failure recovery leave stored history correct, and that
    no auth key is persisted.
- [ ] At the end of this milestone, verify auth-key/account binding, response UID
  and server mapping, account switching, and empty/missing-context handling before
  declaring the milestone complete; preserve existing service isolation checks.
  - [ ] Verify auth-key/account binding and response UID and server mapping.
  - [ ] Verify account switching and empty or missing-context handling.
  - [ ] Confirm the existing service isolation checks still pass.

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
- [ ] Source banner metadata mapping HSR `gacha_id` pool IDs to banners; keep
  initial imports independent of metadata lookup.
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


## Deferred low-priority follow-ups

- [ ] Detect suspiciously unmatched roll IDs across substantially overlapping older
  history periods using timestamps, scoped to the same game/account/server/banner.
  Distinguish genuine gaps from anomalous overlap and flag detected mismatches
  before commit without automatic reconciliation. Define thresholds and test
  incorrect/skipped earlier imports and legitimate same-second rolls. This niche
  diagnostic is not a prerequisite for milestones 2 or 3; see the
  [identity contract](HSR-API-CONTRACT.md#identity-and-mismatch-handling).
