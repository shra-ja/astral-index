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
- [x] Implement the [initial API contract](HSR-API-CONTRACT.md) in a user-initiated
  native client: the two history endpoints (collaboration warps use
  `getLdGachaLog`), 1000-record default pages, cursor pagination,
  cancellation and actionable failures. Use one retry
  per transiently failed request, at most two extra attempts per acquisition, and
  synthetic request mocks. No background or automatic fetching.
  - [x] Build single-endpoint requests from an extracted context: fixed
    authentication, language and size, 1000-record default pages, and page and
    cursor parameters.
  - [x] Add a mockable transport with finite timeouts that enforces the 2 MiB
    response bound while receiving data. Record the HTTP dependency choice.
  - [x] Classify outcomes as actionable failures: `-101` expired key, other
    nonzero codes, rate limits, malformed responses, and transient connection
    failures or HTTP 5xx. Do not expose raw messages or payloads.
  - [x] Validate at most five extracted contexts, in reverse file order, by
    sending each cached request unchanged, and use the first whose auth key
    works. If none works, stop with an actionable error
    ([auth-key validation](HSR-API-CONTRACT.md#auth-key-validation)). Run
    validation in the same user action as extraction, keep each cached URL only
    until validation ends, and hold only the validated context in the session
    ([decision 0007](decisions/0007-validate-during-extraction.md)). Update the
    controls, which will then contact HoYoverse, and their failure messages.
    Retries during validation arrive with the retry-budget step.
  - [x] Paginate each category by cursor. Stop on an empty page and advance on
    any other (corrected 2026-09-29: `getLdGachaLog` caps pages at 20, so a short
    page is not the last), reject repeated cursors and cycles, and enforce the
    16 MiB batch bound. Fetch all six known categories sequentially.
  - [x] Request the collaboration categories from `getLdGachaLog`, found in
    Windows testing to hold their history; accept cached requests to either
    endpoint. Treat `retcode -110` as a rate limit and pause 500 ms before every
    request.
  - [x] Apply the retry budget: one retry per transiently failed request after a
    short bounded delay, and at most two extra attempts per acquisition,
    including validation requests.
  - [x] Support cancellation that stops further requests and writes nothing.
  - [x] Optional, not blocking the milestone: report retrieval progress (the
    current category, pages and records so far, and any pending retry) so the
    user can make an informed choice to stop. Native events only; the webview
    receives them with the acquisition commands below.
- [ ] Connect acquisition to import preview, atomic commit, and history display.
  Expose a narrow native review DTO with validated account/server/context, counts
  and conflict locations, plus the failing category and page for retrieval
  failures.
  Do not reparse private source bytes in the frontend or expose credentials/raw
  payloads in diagnostics.
  - [x] Resolve the account UID and server from the retrieved responses, per
    the [contract](HSR-API-CONTRACT.md#account-server-and-timestamps): every
    record's `uid` and every page's `region` must agree, and neither is ever
    fabricated. A retrieval with no records is a normal outcome, not an import
    error: report readably that no history was found, and create no account.
  - [x] Build the native review DTO from an acquisition preview. Besides counts,
    account and server, include per-category counts and the covered time range,
    so the user can judge whether the retrieval looks complete.
  - [x] Hold the validated context with the retry budget its extraction started,
    and add a `cancel_acquisition` command that stops the running operation
    (validation now, retrieval later) and drops the context. A cancelled or
    superseded operation keeps no late result.
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
  - [x] Add a `retrieve_history` command: retrieve from the held context with
    its budget, cancellably, stream progress over a Tauri channel, resolve the
    account and preview it. Return the review or "no history found", with the
    failing category and page for retrieval failures. Clear the auth key as
    soon as retrieval ends, whether it succeeds, fails or is cancelled.
  - [x] Add `commit_import` and `discard_import` commands for the held preview.
  - [x] Add accessible review and commit controls for the preview: chain "Start
    retrieval" into retrieval, show progress beside a Cancel control, then the
    review with Commit and Discard. Give every failure, `cancelled` and "no
    history found" a readable message.
    - [x] Chain retrieval after validation, with progress, Cancel and a message
      for every retrieval failure and "no history found".
    - [x] Show the review with Save and Discard, conflicts and the save result.
  - [x] Decide whether the webview adopts a component framework, and review the
    visual design, before the stored-history display. Record the choice as a
    decision; weigh 100% branch coverage of compiled templates and dependency size.
    - [x] Adopt Vue 3 with TypeScript 6 and `create-vue`/Tauri conventions
      ([decision 0011](decisions/0011-vue-frontend.md)): tooling, split type
      projects, the tested Vite config and the review screen as a component.
    - [x] Move the frontend into a self-contained `src-ui/` npm workspace beside
      `src-tauri/`, with sibling `*.test.ts` unit tests and integration tests in
      `src-ui/tests/`; no behaviour change.
    - [x] Move the rest of the UI to Vue: `App.vue`, Vue Router with a first
      view, composables for the retrieval flow, small presentational components
      and styles in `assets/`.
    - [x] Lint with type-aware ESLint and format with Prettier in both workspaces
      ([decision 0012](decisions/0012-linting-and-formatting.md)).
    - [x] Review the visual design with a mockup of the stored-history display.
      - [x] Mock up the history and import screens on a design canvas (outside
        the repository): sidebar game and screen switching, banner category tabs,
        a toolbar with rarity filters, search and list, grid and icon layouts,
        a pity column, the import flow with progress, review, saved and failure
        states, and styled tooltips. Icons and banner art stay placeholders.
      - [x] Choose the UI typeface: Hanken Grotesk, with tabular figures for
        numbers, after comparing IBM Plex Sans, Manrope, DM Sans and Figtree.
      - [x] Bundle Hanken Grotesk with the app (open font licence); no remote
        fonts.
      - [x] Record the visual design as a decision
        ([decision 0013](decisions/0013-visual-design.md)).
  - [x] Set the app window's minimum size to 480×560 where the window is
    created. It excludes phones in either orientation; layouts are fluid above
    it, so the minimum can be lowered if mobile is ever targeted.
  - [x] Display stored history from local storage without triggering acquisition.
    - [x] Add the app shell from [decision 0013](decisions/0013-visual-design.md):
      a sidebar with the game switcher and separate History and Import screens
      per game, opening on Star Rail's History. Move the existing retrieval flow
      onto the Import screen; Genshin Impact's Import screen says retrieval is
      coming soon.
    - [x] Restyle the Import screens to the design: sources, progress, review,
      saved and failure screens, with the retrieval flow reporting its outcome.
      The review's roll preview and the per-category progress counts follow
      their own items.
    - [x] Add a mock HoYoverse debug binary, `roll-tracker-mock`: the same app
      with an in-process mock transport serving synthetic scenarios chosen by an
      environment variable (multi-page success, expired link, network failure,
      rate limit, no history). The shipped binary keeps no test hooks. Add a
      native smoke test that runs the full flow through it with screenshots of
      each screen, and a command to run it by hand. Record it as a decision
      ([decision 0014](decisions/0014-mock-debug-binary.md)).
    - [x] Show friendly server names (for example "Asia" for
      `prod_official_asia`) wherever the account's server appears, falling back
      to the raw value for unknown servers.
    - [x] Replace the hand-drawn inline SVG icons with Lucide
      (`@lucide/vue`, ISC licence, bundled per icon), keeping the brand mark
      and game monograms custom. No behaviour change.
    - [x] Count the new 5★ and 4★ rolls in a save, as rows with that rarity
      among the rolls being added (not unique items), and show them on the
      Saved screen.
    - [x] Add a native command returning one page of an account's stored rolls
      for one banner category, newest first. Order by time, then by numeric roll
      ID within the same second, matching the observed descending API order;
      page in Rust.
    - [x] Return every category's count with each page, for the History
      screen's tab counts.
    - [x] Show the History screen: category tabs (a dropdown when they do not
      fit), the paged list with item, rarity, type and time, and the empty state.
      Show the most recently imported account; switching accounts is milestone 4.
  - [x] Expose the latest import (time, source, account and rolls saved) from the
    stored batch summaries, for the Import screen's "Last import" line.
  - [x] Show per-category page counts in retrieval progress, derived from the
    existing progress events (category and page); no native change expected.
- [ ] Incremental retrieval, so a repeat retrieval stops each category once it
  reaches rolls already saved, instead of fetching the whole history. Full
  retrieval takes noticeably longer since collaboration pages hold only 20
  records. The contract makes duplicates no stopping rule today, because stopping
  early never fills a gap left by an earlier failed or partial import (as the
  collaboration categories were before their endpoint was fixed). The user chose
  separate actions: a quick refresh that stops at saved rolls, and a full
  retrieval as today, rather than the app deciding when a full retrieval is
  needed. Requesting both endpoints concurrently is a later option only if live
  testing shows separate rate limits.
  - [ ] Record the rule as a decision and in the HSR contract: a quick refresh
    ends a category after the first page holding a roll already saved for that
    page's own account (UID and server from the page), keeping that page; a page
    without a server never ends it early. Full retrieval is unchanged, and only it
    fills gaps left by earlier failed or partial imports.
  - [ ] Read the saved roll IDs of the game, grouped by account, from storage in
    one query, for the stop check. Local only.
  - [ ] Let pagination take an optional stop check per page, ending a category
    early when it matches, and report in progress whether each category ended at
    saved rolls. Without a check, retrieval behaves exactly as today.
  - [ ] Add a `mode` to `retrieve_history` (`new` or `full`), loading the saved
    IDs only for `new`; anything else is an `invalid_request`. The UI keeps
    passing `full`, so behaviour is unchanged until the switch exists.
  - [ ] Add a "New rolls only" / "Full history" switch to the Retrieve card,
    defaulting to new rolls and applying to both the device search and a chosen
    cache file. With nothing saved, both modes retrieve everything.
  - [ ] Mark a category that stopped at saved rolls as "Up to date" in the
    retrieval progress list.
  - [ ] Verify through the mock binary that a refresh after saving requests one
    page per category and finds nothing new, while a full retrieval still
    requests every page.
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
- [ ] Add account/server switching, filters, totals, and rarity breakdowns:
  the account switcher, rarity filters and item search, and the summary strip
  ([decision 0013](decisions/0013-visual-design.md)).
- [ ] Add the Grid and Icons layouts and the icons-and-banner-art toggle, with
  placeholder art and styled tooltips.
- [ ] Source banner metadata mapping HSR `gacha_id` pool IDs to banners; keep
  initial imports independent of metadata lookup.
- [ ] Implement verified banner grouping and pity calculations that treat each
  pity group's stored rolls as complete, recalculating later rolls after older
  rolls are imported. Derive pity on read rather than storing it
  ([architecture](ARCHITECTURE.md#statistics)). Until verified metadata defines
  pity groups, each banner category keeps its own count. Show it in a Pity
  column.
- [ ] Colour 5★ pity by closeness to soft pity, with thresholds per banner
  category (the mockup uses 1–49, 50–74 and 75+ as placeholders).
- [ ] Colour 5★ pity by 50/50 outcome (won, lost, guaranteed) once banner
  metadata identifies featured items; until then the control stays disabled
  with an explanatory tooltip.
- [ ] Decide how to obtain item icons and banner art without committing game
  assets to the MIT-licensed repository. Fetching them on demand would further
  relax the local-only rule and needs its own decision; placeholders stay until
  then.

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
- [ ] Choose distribution, document supported formats, and provide recovery help.
  The code is MIT-licensed; ship bundled third-party files, such as the font,
  with their own licences.


## Deferred low-priority follow-ups

- [ ] On the first start in portable mode, when the `data` folder has no database
  but the local folder does, offer to copy the history across: verify the copy
  and keep the original. Replaces the documented manual copy.


- [ ] Extend the review DTO with individual records, starting with highlighted
  5-star characters and light cones as a quick accuracy check. Rarity
  (`rank_type`), `item_type` and localized `name` are already in each record;
  banner meaning (limited or standard, pity) needs the milestone 4 metadata.

- [ ] Detect suspiciously unmatched roll IDs across substantially overlapping older
  history periods using timestamps, scoped to the same game/account/server/banner.
  Distinguish genuine gaps from anomalous overlap and flag detected mismatches
  before commit without automatic reconciliation. Define thresholds and test
  incorrect/skipped earlier imports and legitimate same-second rolls. This niche
  diagnostic is not a prerequisite for milestones 2 or 3; see the
  [identity contract](HSR-API-CONTRACT.md#identity-and-mismatch-handling).

- [ ] Recheck `npm audit` for a patched `braces` (advisory GHSA-vfj7-8cjw-p6xm,
  all versions up to 3.0.3), which the dev tooling pulls in through
  `@vue/eslint-config-typescript` and `fast-glob`; update once a fix exists. Not
  `npm audit fix --force`, which downgrades the ESLint config to 14.0.1. The
  shipped app does not include it, and only our own lint globs reach it.
