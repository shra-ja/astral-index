# 0028 — Incremental retrieval

Status: Done · Milestone 7, Saved history display and refresh
Decisions: [0015](../../decisions/0015-incremental-retrieval.md)

A quick refresh that stops each category at saved rolls, beside the full
retrieval.

## Tasks

- [x] Incremental retrieval, so a repeat retrieval stops each category once it
  reaches rolls already saved, instead of fetching the whole history. Full
  retrieval takes noticeably longer since collaboration pages hold only 20
  records. The contract makes duplicates no stopping rule today, because stopping
  early never fills a gap left by an earlier failed or partial import (as the
  collaboration categories were before their endpoint was fixed). The user chose
  separate actions: a quick refresh that stops at saved rolls, and a full
  retrieval as today, rather than the app deciding when a full retrieval is
  needed. Requesting both endpoints concurrently is a later option only if live
  testing shows separate rate limits.
  - [x] Record the rule as a decision and in the HSR contract: a quick refresh
    ends a category after the first page holding a roll already saved for that
    page's own account (UID and server from the page), keeping that page; a page
    without a server never ends it early. Full retrieval is unchanged, and only it
    fills gaps left by earlier failed or partial imports.
  - [x] Read the saved roll IDs of the game, grouped by account, from storage in
    one query, for the stop check. Local only.
  - [x] Let pagination take an optional stop check per page, ending a category
    early when it matches, and report in progress whether each category ended at
    saved rolls. Without a check, retrieval behaves exactly as today.
  - [x] Add a `mode` to `retrieve_history` (`new` or `full`), loading the saved
    IDs only for `new`; anything else is an `invalid_request`. The UI keeps
    passing `full`, so behaviour is unchanged until the switch exists.
  - [x] Add a "New rolls only" / "Full history" switch to the Retrieve card,
    defaulting to new rolls and applying to both the device search and a chosen
    cache file. With nothing saved, both modes retrieve everything.
  - [x] Mark a category that stopped at saved rolls as "Up to date" in the
    retrieval progress list.
  - [x] Verify through the mock binary that a refresh after saving requests one
    page per category and finds nothing new, while a full retrieval still
    requests every page.
