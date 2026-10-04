# Product brief

## Purpose

Give players a durable, local record of their rolls across multiple gacha games.
Users own their data and can inspect, back up, and export it without a hosted service.

## Confirmed requirements

- Tauri desktop application with a web-based interface.
- Run on the user’s machine and store player data locally.
- Fetch history directly from HoYoverse only upon an explicit user request;
  no startup fetching, background polling, or automatic synchronization.
- Multiple games, initially Genshin Impact and Honkai: Star Rail.
- Ingestion from user-provided files and user-requested HoYoverse API responses.
  Local installation files may supply request/authentication context.
- HSR extraction uses user-requested automatic discovery of `data_2`, with a
  user-provided file as the fallback if discovery fails. No discovered-cache
  selection or game-directory picker is required.
- Test-driven development with a mandatory 100% first-party code coverage gate.
- Trunk-based development: all code changes on separate short-lived branches.

## Proposed first release

1. Select a game and account, then explicitly request history from HoYoverse
   using a supported source of authentication. Add supported history-file import
   after the first API import flow.
2. Preview the detected format, account, accepted records, duplicates, and errors.
3. Confirm import and browse persistent history with game/account/banner/date filters.
4. View roll totals, rarity breakdowns, and game-specific pity information only
   where the imported evidence and verified rules support it.
5. Export a versioned portable backup and restore it into a fresh local profile.
6. Automatically discover and extract request context from `data_2` when requested,
   with a user-provided cache file as the fallback. Fetch history only when
   requested. Route responses through the same import pipeline; explain
   unsupported sources.

Honkai: Star Rail API history import came first; the [roadmap](ROADMAP.md)
sequences the rest.

## Acceptance criteria

- History requests require connectivity and happen only on explicit user action.
- Network/authentication failures and cancellation preserve existing history.
- Stored-history browsing, analysis, file import, and export remain local and
  do not initiate network requests.
- Data survives application restart; overlapping imports do not inflate history.
- Different games, accounts, and servers cannot contaminate each other's history.
- Failed imports leave existing data intact and explain how to correct the input.
- Missing historical coverage and uncertain statistics are visibly identified.
- Backup/restore preserves records, source identity, and relevant metadata.
- Import previews and history navigation work with a keyboard and have useful
  loading, empty, success, and error states.

## Outside the initial scope

Cloud sync, public profiles, spending recommendations, live game overlays,
automatic updates, game process inspection, and automatic history fetching.
User-requested HoYoverse history acquisition is in scope; see
[decision 0002](../architecture/decisions/0002-user-requested-history-acquisition.md).

## Open decisions

- Native validation on Windows, the initial game-installation OS, and installer
  packaging. Development and CI run on Ubuntu and WSL.
- Exact supported history-file formats and other local sources, verified with
  documentation and synthetic or redacted samples before claiming compatibility.
- How users identify accounts and resolve ambiguous imports, and account
  reconciliation in general.
- Distribution, and the source of item icons and banner art
  ([feature 0036](features/0036-item-icons-and-banner-art.md)). The code is
  MIT-licensed.

These are open decisions, not implied user preferences. Implementation may choose
reversible technical defaults and record the reasoning. Settled choices are
[decision records](../architecture/decisions/DECISIONS.md).
