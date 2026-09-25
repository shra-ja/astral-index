# Historical project status

Archived on 2026-09-25. Statements and “Next” items below describe their historical
context, not current priorities. See [current status](STATUS.md).

## Current state

Milestone 1 implementation and validation are complete. Work was developed on
`feat/offline-shell` from authorized baseline `2d78399` and published in
[PR #1](https://github.com/shra-ja/roll-tracker/pull/1). The user confirmed hosted
CI passed and **Tests and 100% coverage** is required on protected `main`.
The remote uses SSH: `git@github.com:shra-ja/roll-tracker.git`.

The app is a vanilla TypeScript/Vite web UI in Tauri 2, with game selection,
an accessible local-app empty state and bundled styling. The shell has no user-facing import,
game rules or statistics. The native library now has an HSR response parser and
SQLite preview/import/history services, independently of the shell. Production CSP blocks network calls;
no native capabilities or plugins are enabled. Decision 0001 records the stack.

## Milestone 2 contract complete (2026-09-23)

Formalised [the initial HSR API contract](HSR-API-CONTRACT.md) on
`feat/hsr-response-foundations` using the user's explicit scope decisions. Milestone
2 is complete under those accepted assumptions. Reviewed all 12 saved response
bodies locally, reporting only field types and aggregate context evidence.
The contract documents every observed field, six recognised banner codes, stable
identity/conflict policy, auth-key account selection, server-local timestamps,
tested cursor pagination, low-request defaults and bounded retries. A successful
page containing fewer records than requested, including an empty `list`, ends
retrieval for that category without a follow-up request. The expired-key response
is confirmed: HTTP 200, `retcode: -101`, message `"authkey timeout"`, `data: null`.
The client must stop without retrying and prompt for a refreshed key. Initial
contract decisions are settled and the questions section has been removed.
Assume no new rolls are made during an import; handling history changes during
pagination is deferred.
Default request size is
`1000`; `5000` remains the largest tested value. Pagination retrieves remaining
records, so no higher-limit testing is required.
`gacha_id` identifies an individual pool and is sufficient for initial import.
Banner metadata lookup is deferred to later banner work in milestone 4. Category
`21` is Character Collaboration Warp; `22` is Light Cone Collaboration Warp.
Roll IDs and their records are immutable; matching IDs with changed fields abort
import. Timestamp-based detection of unexpectedly unmatched IDs across a large
overlap with older history is a deferred, low-priority diagnostic, not currently
implemented. It must account for earlier incorrect or skipped imports and must
not merge legitimate same-second rolls.

The samples contain record UID, page region and consistent integer offset evidence;
this supports the server-time assumption for now without independently proving
clock semantics. `list_v2` was present and empty in every saved response. Its
purpose is unknown; assume it is always empty for the initial implementation.
Complete retained history and manageable per-account volume are accepted product
assumptions, not new empirical retention guarantees. The initial review made no
live requests or executable code changes. Later user-authorized comparisons made
twenty successful requests using the updated
cache: incrementing `page`, fixed `page=1`, and omitted `page` with advancing
`end_id` returned identical 50-record sequences. Only page metadata differed;
omitting the parameter returned `data.page="0"`. A fourth run incremented `page`
without `end_id`: all five requests repeated the first ten records, yielding only
10 unique IDs among 50 entries despite increasing response page metadata. A read-only
cache inspection also found three in-game category-11 requests with `page=1,2,3`
and changing cursors. The contract retains page increments to mirror that client
convention; `end_id` controls pagination. Raw responses remain
in ignored local storage; the application code is unchanged. The public UIGF enum was reviewed without sending local data. Banner labels
use the official in-game terminology supplied by the user; superseded third-party
implementation references have been removed.

Formal account/server verification is now explicitly the final milestone-3 task.
Next: implement milestone 3's read-only source discovery and single-endpoint client
against the contract, with TDD, synthetic requests and the established full gates.
The existing parser/storage guarantees remain intact; the client, retries
and user-visible conflict errors are still future work.
This documentation-only change requires no new behavior tests. Whitespace and
relative-link checks passed; the contract inventory covers every sampled field
and contains no sampled account or roll IDs. The user authorized committing all
pending documentation changes on 2026-09-24. No push, integration or release
was performed.

## Intent-focused comments (2026-09-23)

Added short comments describing purpose and protected invariants in Rust models,
storage/parser helpers, frontend/tooling functions and non-obvious test helpers.
Straightforward accessors, wrappers and clearly named tests retain their existing
concise form. `CONTRIBUTING.md` now establishes this as the default review practice.
All source/test changes are comments only; no behavior changed, so no new TDD
cycle was needed. The user authorized committing this increment on
`feat/hsr-response-foundations`.

`npm run check` passed: 37 Rust tests, 17 frontend/tooling tests, native offline
integration, three coverage failure probes, required per-file 100% coverage,
TypeScript, formatting and Clippy. The native namespace required the permitted
run outside the sandbox. `git diff --check` passed. A production rebuild was not
needed for comments. Next remains external HSR API contract verification; no push
or integration was performed.

## Milestone 2 compact overlap storage (2026-09-23)

Implemented the four overlap-focused roadmap items on the existing
`feat/hsr-response-foundations` task branch. Fetched `origin`; `origin/main`
remained at the branch base `3dedfc4`. The user authorized committing this
increment, including the pre-release schema simplification. No push, integration
or release was performed.

Schema 2 stores unique rolls with first-import provenance and compact successful
batch summaries. Repeated imports retain counts, time and scoped adapter context,
without snapshots or repeated roll associations. Prepared statements handle
classification and new-record inserts; previews no longer keep a full-page copy.
Conflicts, isolation, immutable input ownership, stale previews and rollback
remain enforced. At the user's request, the compact schema is now the sole initial migration.
Breaking pre-release schema changes are permitted; obsolete development databases
are rejected unchanged and must be explicitly recreated. There is no upgrade
chain. The lack of historical input reconstruction and compatibility policy are
recorded in [decision 0004](decisions/0004-compact-import-provenance.md).

TDD: repeat-import tests first failed on attempted duplicate inserts. For the
subsequent schema simplification, tests first failed because initial SQL created
the old layout and opening an obsolete database attempted an upgrade. Compact
initialization and explicit rejection now satisfy these assertions. Initialization
rollback and persistence tests remain; obsolete upgrade tests were removed.

Verification after simplification: focused Rust tests and `npm run check` pass,
including 37 Rust tests, 17 frontend/tooling tests, native offline integration,
three failure probes, formatting, TypeScript and Clippy. Every first-party file
meets the required 100% coverage metrics. Storage has 191/191 lines, 257/257
regions, 23/23 functions and 32/32 branch outcomes covered. The native namespace
required the permitted run outside the sandbox.

The standalone synthetic test imports 6,000 rolls, repeats the same year 24 times,
then advances the 12-month window 12 times, reaching 12,000 unique rolls and 37
summaries. Initial/repeat/rolling times were 202 ms / 4.143 s / 2.062 s; process
peak RSS was 26,376 KiB. The database stayed at 2,420,736 bytes through complete
repeats, then grew to 4,808,704 bytes with new rolls. These are local debug-build
observations, not release-speed guarantees. See [testing](TESTING.md#overlapping-imports-and-schema-2-2026-09-23)
for the reproducible workload, assertions and measurement limits.

`npm run tauri -- build --no-bundle` passed. Relative Markdown links and
`git diff --check` passed. Commit: `feat(storage): compact overlapping imports`.

Next: finish the external HSR API response/identity/timezone/pagination/error
verification item. Synthetic tests do not establish live endpoint compatibility
or history completeness. The shell still opens no database and has no acquisition
or import UI; that integration belongs to milestone 3. Hosted CI has not run for
this increment.

## Milestone 2 response foundations

On `feat/hsr-response-foundations`, created from up-to-date `main` before code
changes, contribution guidance was updated first to favour frequent small atomic
commits. At the user's request, that documentation alone was committed as
`9bea698` (`docs: favour small frequent atomic commits`). The user subsequently
authorized committing the response foundation as
`feat(hsr): validate bounded API response pages`, including its synthetic tests,
contract research and status documentation.

Implemented a pure Rust page/roll model and response parser with a 2 MiB body
bound, string identity preservation, calendar validation, six supported banner
categories, optional server/offset evidence, intra-page account consistency and
safe error categories. Unknown page/record fields, unknown catalog identifiers,
source order, duplicates and conflicts are retained. It does not infer UTC,
completeness, account identity from empty pages, or a server from UID/offset.
Synthetic valid/empty/error fixtures and scripted request/response mocks cover
parser boundaries without credentials, private files or network calls.

TDD: seven behavior tests failed against a compiling placeholder, then passed;
two follow-up assertions failed for unknown-field loss and API errors without
data, then passed after implementation. Ten Rust tests pass, including a
scripted overlap/terminal-response scenario. See [testing](TESTING.md) for details.

Final verification on Ubuntu 24.04:

- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test hsr`:
  all 10 tests passed.
- `npm run check`: passed; 17 UI/tooling tests, 10 Rust tests, native keyboard/CSP/
  shutdown integration, 3 failure probes, source inventory and fresh coverage
  verification, TypeScript build, Rust formatting and Clippy all passed.
- Frontend/tooling: 100% lines/statements/functions/branches per file.
  HSR parser: 47/47 lines, 57/57 regions, 6/6 functions, 36/36 branch outcomes.
  Startup/build-script coverage remains complete. No exclusions or thresholds changed.
- `npm run tauri -- build --no-bundle`: passed.
- Relative Markdown links and `git diff --check`: passed. Hosted CI was not run
  for this branch; other platforms remain untested.

The response-parser handoff deferred the database, migration and transactional
services. The storage increment below now implements those foundations.
The API format-verification item remains open: current global endpoint variants,
terminal pages, expiry/rate-limit behavior and completeness need further evidence.
The parser is not connected to the shell or an HTTP client. Scripted mocks do not
validate network transport or an automatic pagination loop. See
[response research](HSR-API-RESEARCH.md#response-foundation-review-2026-09-21).

## Milestone 2 SQLite services (2026-09-22)

Continued on `feat/hsr-response-foundations` after confirming `origin/main` had
not advanced beyond the branch's base. Parser commit `c4715a8` remains intact.
The user authorized committing this increment on 2026-09-23, including the
schema, tests, test layout and documentation. No push, integration or release
was performed.

Selected pinned `rusqlite` 0.40.2 with bundled SQLite; see
[decision 0003](decisions/0003-sqlite-import-foundations.md). Implemented schema
version 1, native database open, immutable HSR previews, atomic commits, scoped
history queries and batch provenance. Text identity keys preserve game/UID/server/
record separation. Source fields, unknown extensions, order, optional timezone,
repeat occurrences and a caller-supplied import timestamp are retained.

Preview validates every page before database classification. Conflict counts block
the complete batch. Commit holds a write transaction, rejects cross-database or
stale previews, rechecks timezone evidence and record classifications, and writes
accounts, records, provenance and revision together. Reimports add no duplicate
rolls. The service has no source rereads, automatic acquisition or clock access.
A 16 MiB batch bound supplements the parser's 2 MiB page bound. Empty datasets
return a no-records error without creating an account.

TDD evidence: eight initial service tests failed against a compiling placeholder,
then passed with the storage implementation. Later failing regressions drove
payload and timezone rechecks before commit, and caller-supplied import time.
Real SQLite failure tests verify rollback on partial DDL, denied operations,
failed inserts, locked writers and failed final commits. Tests also cover restart,
source ownership, cancelled previews, overlaps, conflicts, isolation, unknown
timezone, incompatible database headers and corrupt stored values.

Verification:

- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`: passed
  all 33 Rust tests (17 service integration, 6 internal failure, 10 parser).
- `npm run check`: passed, including the same Rust tests, 17 UI/tooling tests,
  native keyboard/CSP/shutdown integration, 3 failure probes, report inventory,
  TypeScript build, formatting and Clippy with warnings denied.
- Frontend/tooling: 100% required metrics per file. Storage: 180/180 lines,
  259/259 regions, 23/23 functions and 32/32 branch outcomes. Parser, startup and
  build-script coverage remain complete. No coverage exclusions or thresholds changed.
- `npm run tauri -- build --no-bundle`: passed. Relative Markdown links and
  `git diff --check` passed.
- An initial sandbox run could not create the native network namespace; the
  permitted rerun retained isolation. Initial uncovered propagation paths and
  test lint findings were corrected before the final passing full check.

The roadmap's database/service and service-verification steps are complete.
The API contract-verification step remains open; synthetic tests do not establish
live global-endpoint variants, terminal-page behavior, expiry or retention.
Next: finish that evidence review, then connect explicit acquisition and native
preview/commit/history commands in milestone 3. The shell still opens no database;
app-data path selection, account-resolution UX, mid-commit UI cancellation,
backup/restore, later migrations and other OS support remain future work. Hosted
CI has not run for this increment.

## Test layout (2026-09-22)

At the user's request, frontend tests now live in `src/tests/`, backend Rust
tests and fixtures in `src-tauri/tests/`, and tooling tests in `scripts/tests/`.
Root `tests/` now contains only the application native end-to-end test, its X11
helper and documentation. `CONTRIBUTING.md` records this convention for future work.

Cargo discovers the HSR integration test automatically; its custom manifest path
was removed. Storage tests remain in one library test artifact for private
failure-boundary access and complete coverage, with their files under
`src-tauri/tests/storage/`. Package commands, imports, fixture references and
coverage inventories were updated. Test-directory exclusions now follow each
layer; no production source was excluded and thresholds remain unchanged.

This refactor started with 17 frontend/tooling and 33 Rust tests passing. The
same tests pass after relocation. Final `npm run check` passed, including native
end-to-end execution, coverage failure probes, fresh per-file 100% coverage,
TypeScript build, Rust formatting and Clippy. The native namespace required the
permitted rerun outside the sandbox. Relative Markdown links and
`git diff --check` passed. Application behavior is unchanged, so no new behavior
or regression test was needed. The earlier production build remains applicable;
this test-layout refactor did not require another production build.

The test layout is included with the storage increment on
`feat/hsr-response-foundations` in the user-authorized commit.

Fresh pre-commit validation on 2026-09-23: `npm run check` passed, including
all 33 Rust tests, 17 frontend/tooling tests, native end-to-end tests, failure
probes, 100% required coverage, formatting and Clippy. Relative Markdown links
and whitespace checks also passed.

## Environment

Installed through asdf: Rust nightly-2026-09-16; project selects existing Node.js
26.8.1. Rust includes rustfmt, clippy, llvm-tools-preview, cargo-llvm-cov 0.9.1 and
tauri-driver 2.0.6. `.tool-versions` pins the runtimes. The user installed the
required Ubuntu shared libraries/test utilities; their availability was verified.
Python 3 from the existing asdf setup runs the standard-library-only X11 test helper.

## Milestone 1 verification

- `npm run check`: passed on Ubuntu 24.04 x86_64, including strict TypeScript
  checks of app/tooling/tests, Rust formatting and Clippy with warnings denied.
- 17 UI/coverage-validator tests, native integration, 3 failure-probe tests and
  source-inventory/report validation passed. Native probes run additional smoke tests.
- Frontend and executable coverage tooling: 100% lines/statements/functions/branches.
- Rust startup and `build.rs`: 100% lines/regions/functions; no handwritten branch
  points in the final shell. A temporary real Rust branch proved missed branches
  are measured and rejected, then was removed and coverage regenerated.
- Native test ran under Xvfb/WebKitWebDriver without an external network route,
  verified bundled content, game selection by keyboard, blocked external fetch,
  screenshot capture and graceful shutdown with process coverage flushed.
- Tauri production executable built successfully; installer packaging is deferred.
- Milestone audit confirmed all local implementation items; Markdown links and
  workflow YAML validate.
- Hosted CI passed, as confirmed by the user on 2026-09-19. The workflow installs
  the pinned asdf binary with `asdf_version` and grants user namespaces to its
  own Bubblewrap executable with a scoped AppArmor profile, preserving offline
  tests on the Ubuntu runner. **Tests and 100% coverage** is configured as a
  required check in branch protection.

See `TESTING.md` for red/green evidence, scope, exclusions and probe behavior.
Reports and the native screenshot are ignored local artifacts. Other platforms
are untested. At milestone 1 there were no Rust domain tests; native integration
covered the minimal shell and build script. Milestone 2 adds the tests above.

## Prior research and milestone sequencing

Milestone 2 starts with Honkai: Star Rail. Research on
`docs/hsr-cache-format-research` (from up-to-date `main`, `eb10fb5`) now focuses
on API request extraction, query parameters, and pagination. Cache inspection identified request URLs; subsequent API tests established
record retrieval and cursor pagination. See
[HSR API research](HSR-API-RESEARCH.md), renamed to reflect this broader scope.

Offline reproduction found 414 candidates in the original cache. The user's
replacement cache contains three type-11 requests showing `end_id` advancing
to the last ID of the preceding page. Authorized API tests established a
nine-field request recipe. For type 1, incrementing `page` with `end_id=0`
repeated the same ten records; advancing both page and cursor returned 50 unique
records across five pages, exactly matching the first 50 earlier size-100
records in order and every field. See the research notes for the
comparison method, results, and limits. Pagination edge cases and completeness
remain unverified. No private record IDs are copied into the docs.

The cache investigation checked local comparison evidence, documentation links,
and whitespace. The subsequent product-scope update includes a small UI wording
change and fresh validation, described below. No additional API requests were
made. Windows discovery remains untested.

Next: verify the HSR API response schema, record identity, timezone semantics,
and pagination termination before synthetic parser fixtures and request mocks.
Milestone 2 establishes parsing/storage/import services; former milestone 5 is
now milestone 3 and completes the first user-facing API import feature. History-
file import and multi-game/statistics follow in milestone 4, then backup/restore
in milestone 5. User-requested HoYoverse acquisition
is now an accepted requirement
([decision 0002](decisions/0002-user-requested-history-acquisition.md)), alongside
local file import. No network functionality is added to the application; live
probes were separate research requests.

## Product connectivity update

The user replaced the offline-only acquisition assumption with explicitly
requested HoYoverse history fetching. The app and player data remain local;
there is no startup fetching, background polling, or automatic synchronization.
Project requirements, agent/contributor guidance, architecture, roadmap, and
research now reflect that decision. Automated tests must stay local and
self-contained, using request mocks or local synthetic test servers when the
client is implemented. The current shell still has no API client, and its
restrictive webview CSP and isolated native tests remain intentional.

On `docs/hsr-cache-format-research`, the shell badge now says “Local app” instead
of “Offline.” TDD: the updated UI assertion failed on the old label; after the
copy/style-class change all 17 UI/tooling tests passed. Fresh `npm run check`
passed, including native keyboard/offline integration, failure probes, per-file
100% coverage verification, type/build checks, Rust formatting, and Clippy.
`npm run tauri -- build --no-bundle` passed. The first full-check attempt hit a
sandbox namespace restriction; the permitted rerun passed. Documentation links
and `git diff --check` also passed. No commits or publishing were performed.

## Outstanding decisions

The UIGF v4.2 reference skill is installed locally to the project at
[`.agents/skills/uigf/SKILL.md`](../.agents/skills/uigf/SKILL.md). It covers
roll storage, import/export, IDs, enums, timestamps, and legacy conversion.
The installed copy passed the skill validator and matches the validated source;
its synthetic example was checked against the published UIGF schema. This is
documentation only; no storage or import behavior is implemented. App tests and
coverage were not rerun for the skill installation. Next: apply the UIGF contract
when designing the HSR parser and local persistence model.

Supported release OS/packaging; future schema upgrades; exact import formats and
installation-source feasibility; account UX; game-rule evidence; final branding
and license. Do not assume installation files contain usable offline history.

The 2026-09-21 documentation cleanup makes the API research self-contained,
retaining extraction and pagination findings without references to uncommitted
external materials. Documentation links and whitespace checks passed; no code
changes or API requests were made for this cleanup.

The 2026-09-21 roadmap update prioritizes API import as the first feature after
the shell and orders its foundations before acquisition/UI integration. Relative
documentation links and whitespace checks passed. This planning update changed
no executable code and made no API requests.
