# Project status

Updated: 2026-09-21

## Current state

Milestone 1 implementation and validation are complete. Work was developed on
`feat/offline-shell` from authorized baseline `2d78399` and published in
[PR #1](https://github.com/shra-ja/roll-tracker/pull/1). The user confirmed hosted
CI passed and **Tests and 100% coverage** is required on protected `main`.
The remote uses SSH: `git@github.com:shra-ja/roll-tracker.git`.

The app is a vanilla TypeScript/Vite web UI in Tauri 2, with game selection,
an accessible local-app empty state and bundled styling. No import, database,
game rules or statistics are implemented. Production CSP blocks network calls;
no native capabilities or plugins are enabled. Decision 0001 records the stack.

## Environment

Installed through asdf: Rust nightly-2026-09-16; project selects existing Node.js
26.8.1. Rust includes rustfmt, clippy, llvm-tools-preview, cargo-llvm-cov 0.9.1 and
tauri-driver 2.0.6. `.tool-versions` pins the runtimes. The user installed the
required Ubuntu shared libraries/test utilities; their availability was verified.
Python 3 from the existing asdf setup runs the standard-library-only X11 test helper.

## Verification

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
are untested. There are no Rust domain unit tests yet; real native integration
covers the minimal shell and build script.

## Next task

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

Supported release OS/packaging; persistence library; exact import formats and
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
