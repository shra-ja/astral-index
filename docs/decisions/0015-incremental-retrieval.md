# 0015 — Incremental retrieval

Date: 2026-10-03
Status: Accepted

## Context

Every retrieval fetches each category's whole history, even when nearly all of it
is already saved. Collaboration pages hold only 20 records, so a long history
takes many requests, and HoYoverse rate-limits quick successions of them. The
[HSR contract](../HSR-API-CONTRACT.md#pagination-and-request-economy) made
duplicates no stopping rule, because stopping early never fills a gap left by an
earlier failed or partial import, as the collaboration categories were before
their endpoint was fixed.

## Decision

- **Two modes, chosen by the user:** a quick refresh (`new`) that stops at rolls
  already saved, and a full retrieval (`full`) exactly as before. The app does
  not decide when a full retrieval is needed. The Import screen offers the choice
  as a switch on the Retrieve card, defaulting to new rolls and applying to both
  the device search and a chosen cache file.
- **The stop rule:** a quick refresh ends a category after the first page that
  holds a roll already saved for that page's own account, and keeps that page;
  its saved rolls are skipped by the preview as before. The account is the
  page's UID (from its records) and server (its `region`), never the latest
  import's, so another account's history cannot end a category. A page without
  a server never ends a category early. Any ID match counts; IDs are not
  compared by order.
- **Saved IDs are read before fetching,** for the game, grouped by account, in
  one local query, because the account is only known from the responses. Full
  retrieval reads nothing beforehand.
- **Progress** reports whether each category ended at saved rolls, so the
  progress list can mark it "Up to date".
- Everything after fetching is unchanged: the same pages reach the same
  preview, review and transactional save.

## Alternatives and consequences

- **Stopping once a page passes the newest saved ID** needs less data, but relies
  on IDs always increasing over time, which the contract does not promise.
- **The app choosing the mode** (for example a full retrieval after a failed
  import) was rejected by the user in favour of an explicit choice.
- A quick refresh does not fill gaps older than the newest saved rolls. Only a
  full retrieval repairs an earlier failed or partial import; the roadmap's
  gap detection follow-up would flag such gaps.
- Loading every saved ID costs memory in proportion to the history, about 20
  bytes per roll, which stays small for realistic histories.
- A quick refresh of an up-to-date history makes about one request per category
  instead of one per page.
