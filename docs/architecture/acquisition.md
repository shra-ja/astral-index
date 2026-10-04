# Acquisition

Status: implemented for Honkai: Star Rail. The
[HSR API contract](../games/hsr/api-contract.md) owns the API facts: endpoints,
page size, bounds, error codes, the retry budget and pacing. This file describes
how the native client applies them. See decisions
[0002](../decisions/0002-user-requested-history-acquisition.md),
[0007](../decisions/0007-validate-during-extraction.md),
[0008](../decisions/0008-https-transport.md) and
[0015](../decisions/0015-incremental-retrieval.md).

HoYoverse is contacted only in response to an explicit user action. One action
may run a bounded, cancellable sequence: validate the extracted keys, then
retrieve every category. There is no startup fetch, polling or scheduled sync,
and stored-history operations never contact HoYoverse.

## Layers

Every request goes through one stack of `Transport` wrappers, so each concern is
tested alone against scripted transports:

```text
Cancellable( Paced( Retrying( HttpTransport | MockTransport ) ) )
```

- **`HttpTransport`** (`transport.rs`): `reqwest` with rustls. Refuses any URL but
  the two exact endpoints, follows no redirects, uses no proxy, treats anything
  but HTTP 200 as an error, has finite timeouts and stops reading past the page
  bound.
- **`Retrying`** (`retry.rs`): retries a transient failure (timeout, connection,
  HTTP 5xx) once after a delay, while the acquisition's shared `RetryBudget`
  lasts. Validation and retrieval share one budget.
- **`Paced`** (`pace.rs`): waits before every request; a retry keeps its own delay.
- **`Cancellable`** (`cancel.rs`): once the user cancels, drops the request in
  flight and refuses every later one, also interrupting pauses and retry delays.

`outcome.rs` classifies each attempt: HTTP success is not API success. Expired
keys, other API codes, rate limits, transient failures, rejected responses,
invalid responses and internal errors are distinct, safe categories; only
transient failures are retried. Every parser error maps to one explicitly.

## Validation

`validate` (`validation.rs`) takes the extracted cached requests in reverse file
order and sends at most five cached URLs unchanged. The first that returns a
valid page wins; its records are discarded. Expired keys and API codes move on
to the next; any other failure stops. It consumes the cached requests, so no
cached URL outlives it.

## Retrieval

`fetch_history` (`pagination.rs`) requests the six categories in contract order,
each from page 1, building requests from the validated context's fixed fields
plus fresh paging parameters (`request.rs`). Only an empty page ends a category
(collaboration pages are capped at 20, so a short page is not the last). A
repeated cursor is a cycle; the batch stops before passing its total size bound.
The result is the raw response bodies in request order, which storage parses
again during preview.

**Account resolution.** The UID comes from the records and the server from each
page's `region`; every value present must agree, or retrieval stops with mixed
accounts or servers. No records means "no history found", not an error, and no
account is created. Records with no server anywhere fail; nothing is fabricated.

**Quick refresh.** In `new` mode the caller passes a stop check: after each page
whose `region` is named, if any of its roll IDs is already saved *for that
page's own account*, the category ends there, keeping the page. A page without a
region never ends a category early. `full` mode passes no check and fills gaps
that earlier failed or partial imports left.

**Progress.** `Requesting` (category, page, pages and records so far),
`RetryPending` (delay) and `UpToDate` (category) events are reported through a
callback that must return quickly. They carry counts and categories, never IDs,
URLs or response text.

## Invariants

- Auth keys and cached URLs live only in native memory for the duration of one
  user action; see [desktop commands](desktop-commands.md) for the session.
- Retrieval never writes storage; only an explicit commit does.
- Failures, cancellation and bounds stop retrieval; they never produce a
  silently truncated history.
- Tests use scripted transports and the mock debug binary's synthetic
  HoYoverse; no automated test contacts HoYoverse.
