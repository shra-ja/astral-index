# 2026-09-28: acquisition client (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Coverage probe scope (2026-09-28)

Work is on `perf/coverage-probe-scope`, rebased on `main` at `9b9dd3b`. Native
execution is split into unit coverage, Cargo integration, desktop smoke and report
stages; `test:native` composes them in the original order and still freezes the
unit-only report before integration runs. Each enforcement probe now runs only the
stage it tests, restores its files in `finally`, and selects the specific report
check it expects to fail. The backend, wrapper and CSP probes carry an unrelated
panicking integration test, so a regression to the full pipeline fails them. A new
probe rejects a stale unit report. A suite-level `afterAll` then clears all
reports and runs full frontend coverage, the complete offline native suite and
every report gate once, including after a failed probe; its failures propagate.
HTML is rendered only in that final step. Thresholds, inventories, freshness and
the wrapper guard are unchanged.

TDD: stage, scope, regeneration and unit-snapshot tests failed against stubs or
the old broad commands, then passed. A temporary probe that threw after mutating
and restoring a source still failed the command, and final validation ran.
After the rebase, `npm run check` passed with 80 Rust unit tests, 34 integration
tests, 39 frontend/tooling tests, nine probes and five report checks, all at 100%
per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux. Warm local probe-suite
time fell from 217.24 to 70.66 seconds. On hosted CI (PR #20), the `npm run check`
step took 4 min 23 s against 8 min 53 s on the latest `main` run, well within
the 600-second final-regeneration hook limit. A follow-up refactor shares one
report-check helper and unrelated-test fixture across probes and groups the
native scripts in `package.json`; no probe or gate changed.

## CI caching (2026-09-28)

Work is on `perf/ci-pipeline` (PR #5), rebased on `main` at `6d59e12`. CI caches
npm downloads, Rust dependency builds and installed Cargo tools. Keys account for
toolchains, dependencies and the workflow's tool-version pins. Locked installs,
all probes, fresh coverage generation and the release build remain unconditional.

The first version gave no hosted speedup. Two causes were confirmed from CI logs.
asdf keeps Cargo's home inside the toolchain, so the action cached an unused
`~/.cargo` and both tools were rebuilt every run. rust-cache v2.8.2 also pruned
hyphenated crates from the nightly's new build-dir layout: all 65 reused crates
survived its name rule, and every rebuilt crate was pruned or depended on one
(`proc-macro2` among them). CI now exports `CARGO_HOME` from `asdf where rust`
and pins rust-cache v2.9.2, which supports that layout. See
[TESTING.md](../../development/TESTING.md#ci).

TDD: the CI guard failed against the v2.8.2 pin and missing `CARGO_HOME` export,
then passed. `npm run check` passed with 80 Rust unit tests, the integration
suite, 42 frontend/tooling tests, nine probes and five report checks, all at 100%
per file, plus TypeScript/build, formatting and Clippy.

Hosted cold/warm pair (run 36432648943): the job took 10 min 21 s cold and 3 min
33 s warm. Warm, tool installs fell from 76 s to 5 s, `npm run check` from 4 min
21 s to 1 min 52 s and the release build from 3 min 22 s to 28 s; only first-party
crates recompiled (5 and 1 units, against 451 and 311 cold). All gates still ran.
The Rust cache is about 822 MiB. Lockfile, toolchain or workflow changes start a
new key; rust-cache then restores its closest earlier entry.

## Cached request URLs (2026-09-28)

Integrated through PR #21 (`0cea1d1`), branched from `main` at `deee662`. This is
the first of three PRs for validating during extraction
([decision 0007](../../architecture/decisions/0007-validate-during-extraction.md)): (A) keep cached
URLs, (B) a validation service, (C) commands and controls that validate and so
contact HoYoverse. Extraction now returns a `CachedRequest` per distinct context,
holding the context and its endpoint-checked cached URL from the context's last
occurrence in the file. Debug output is redacted. The desktop session still
stores contexts only, dropping every URL when the command returns. No network
request, command, permission or UI change was added.

TDD: the new test failed against a stub that kept empty URLs, then passed.
Existing tests changed only to unwrap the context from each cached request.

The first full run failed only on `cargo fmt`; after formatting, `npm run check`
passed: 81 Rust unit tests, 34 integration tests, 42 frontend/tooling tests,
native offline execution, nine probes and five report checks, all at 100% per
file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Auth-key validation service (2026-09-28)

Integrated through PR #22 (`81b4c28`), branched from `main` at `0cea1d1` (PR B of
three for [decision 0007](../../architecture/decisions/0007-validate-during-extraction.md)).
`acquisition::validate` sends at most five cached URLs unchanged, in the given
reverse file order, through a `Transport` and `classify`. It returns the first
context whose response is a valid page, discarding that page's records. `-101`
and other API codes move on to the next context. Rate limits, transient,
rejected, invalid and internal failures stop at once. If all keys are rejected,
it reports an expired key if any expired, otherwise the first code; that
second rule is newly recorded in the contract. An empty input sends nothing and
is internal. Every cached URL is dropped on return. `CachedRequest::url` is now
crate-private. No command calls `validate`, and there are no retries yet.

TDD: against a stub that always failed as internal, four of five tests failed.
The empty-input test passed against the stub, since both return internal
without sending. All five pass with the implementation. The tests use a scripted
`Transport` that records every requested URL.

`npm run check` passed: 86 Rust unit tests, 34 integration tests, 42
frontend/tooling tests, native offline execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Validation during extraction (2026-09-28)

Integrated through PR #23 (`207d61e`), branched from `main` at `81b4c28`, the
last of three PRs for [decision 0007](../../architecture/decisions/0007-validate-during-extraction.md).
Both commands now extract, then validate with HoYoverse through `HttpTransport`
and `validate` in the same user action. The session holds only the validated
context. It is emptied before each extraction, so any failure leaves none, and
every cached URL is dropped when the command returns. Failures cross IPC as
`{"kind": ...}`, with `code` only for `api_error`; new kinds are `expired_key`,
`api_error`, `rate_limited`, `network`, `rejected`, `invalid_response` and
`internal`. HTTP statuses and response text stay native. No command, permission
or CSP change was needed; the webview still has no network origin.

The panel now says the app checks the saved link with HoYoverse and needs a
connection. The button reads "Start retrieval", progress names HoYoverse, and
success says HoYoverse accepted the link. Each validation failure has one
message for both actions; API errors show their code. The typed client accepts
only the exact native shape and maps anything else to `unavailable`.

The native smoke test now refuses to run unless loopback is its only network
interface, since the synthetic key would otherwise reach the live endpoint. In
the offline namespace its file upload shows the network failure message.

TDD: three native command tests failed against a stub that stored the first
extracted context without sending anything, then passed. The failure-mapping
and serialization tests were written with their mappings and passed at once.
Three typed-client tests failed on the old string shape, and six UI tests on
the old copy, then passed. One UI assertion wrongly assumed 'Something went
wrong' was still the last message; it now checks the actual last one. IPC-level
tests cover only failures before any request, because Tauri runs commands on
worker threads that cannot see the thread-local HTTP double; the validation
paths are tested through the same functions on the test thread.

Run directly on the host network, the native test fails in setup with
`expected [ 'lo', 'eth0' ] to deeply equal [ 'lo' ]`, before building or
launching anything. `npm run check` passed: 88 Rust unit tests, 34 integration
tests, 43 frontend/tooling tests, offline native execution including the network
failure message, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux. Real validation against HoYoverse with a live key has not been
run; no automated test contacts the endpoint. After integration, the user ran
the app with a real installation and a current key, and saw "HoYoverse accepted
your warp history link". The expired-key path has not been exercised live.

## Cursor pagination (2026-09-28)

Integrated through PR #24 (`0e4f153`), branched from `main` at `207d61e`.
`acquisition::fetch_history` retrieves all six categories in order from a
validated context. Each starts at page 1 with `end_id=0`; a short page, including
an empty one, ends the category; a full page advances the page number and uses
its last record's ID as the cursor. A cursor repeated within a category is a
cycle. A page with more than 1000 records is invalid, a rule now in the contract.
Retrieval stops at the first fetch failure, or once the summed response sizes
pass 16 MiB, before any further request. The result is a `History` of raw
bodies, with redacted debug output, for `Store::preview`. No command calls it
yet; retries and cancellation are separate steps.

Supporting refactors, with existing tests unchanged: `MAX_BATCH_BYTES` moved from
storage to `hsr.rs` so both share it; `classify` now composes new
`transport_failure` and `parse_body` functions; the validation tests' scripted
transport moved to a shared test double.

TDD: six pagination tests failed against a stub that returned an internal
failure, then passed. They cover category order, cursor and page advancement,
a full final page followed by an empty one, repeated cursors, a two-cursor
cycle, the same ID in another category, over-full pages, four failure kinds,
and the batch bound both exactly reached and passed with later requests
skipped. A new integration test passed on its first run, since it composes
tested pieces: scripted responses go through `fetch_history` into a real
SQLite preview and commit.

`npm run check` passed: 94 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retry budget (2026-09-28)

Integrated through PR #25 (`eb75010`), branched from `main` at `0e4f153`. `Retrying`
wraps any `Transport`. It retries a transient failure (timeout, connection
failure or HTTP 5xx) once for the same URL after a one-second delay, while the
shared `RetryBudget` has one of its two extra attempts left. A failed retry is
returned as it is, and rate limits, other statuses, oversized bodies and internal
failures are never retried. `validate` and `fetch_history` are unchanged; they
take the wrapped transport. Both extraction commands now validate through it,
with a new budget per extraction. The delay value is recorded in the contract.

Open requirement: the budget covers the whole acquisition, so the command that
connects pagination must reuse the extraction's budget rather than start a new
one. The session does not hold the budget yet, because nothing would read it.

TDD: three retry tests failed against a pass-through stub, then passed. A fourth,
that non-transient outcomes return at once without spending the budget, passed
against the stub, as expected of a pass-through. A desktop test with a 503 before
each of two validation responses failed with `network`, then passed after the
command wrapped its transport. Delays are measured on a paused Tokio clock.
The pinned nightly deprecates `AtomicU32::fetch_update`, so the budget uses
`try_update`.

`npm run check` passed: 99 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution (its network failure now waits
for one retry), nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux.

## Acquisition planning gaps (2026-09-28)

Integrated through PR #26 (`8ab916f`), branched from `main` at `eb75010`. Reviewing
what a user knows when cancelling showed three unrecorded gaps, now in the
roadmap. Stopping retrieval while it runs is a different decision from
discarding a preview. It needs no data but has no progress to go on, so live
progress is added as an optional step after cancellation. `Store::preview`
needs a UID and server, and nothing yet takes them from the retrieved pages;
a step before the review DTO now does, following the existing contract rule,
and treats a retrieval with no records as "no history found" rather than an
error. The review DTO step now asks for per-category counts and the covered
time range. Documentation-only change; no TDD cycle or gate run applies.

## Cancellation (2026-09-28)

Integrated through PR #27 (`6fbd17a`), branched from `main` at `8ab916f`. `Cancellable`
wraps a transport with a `CancellationToken`. Once the token is cancelled, it
drops a request in flight or a pending retry delay and refuses every later
request without sending it. The new `TransportError::Cancelled` classifies as
`FetchFailure::Cancelled`, which is never retried and stops `validate` and
`fetch_history` unchanged, so no context or history comes back; retrieval never
writes storage in any case. Desktop gains a native `cancelled` failure kind for
the exhaustive mapping. No command creates or cancels a token yet; the cancel
command, its control and the webview message are added to the acquisition
commands step.

`tokio-util` 0.7.19 is now a direct, exactly pinned dependency without default
features, for `CancellationToken::run_until_cancelled`. It was already resolved
through existing dependencies, so the lockfile gains only the dependency edge.
Its source was checked: an already-cancelled token returns without polling the
request.

TDD: against a pass-through stub, the already-cancelled and
validation/pagination tests failed, and the in-flight and retry-delay tests hung
(the stub ignored the token), then all passed. A pass-through test passed
against the stub, as expected. The mapping variants were added with their
table tests. Timing is measured on a paused Tokio clock.

The first full run failed the backend unit gate on one line of `cancel.rs`:
the closing brace of the hanging test double after `pending().await`, which can
never run. The double now returns `std::future::pending()` as its future, with
no unreachable code; nothing was excluded. `npm run check` then passed: 104 Rust
unit tests, 35 integration tests, 43 frontend/tooling tests, offline native
execution, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy. `npm run tauri -- build --no-bundle`
passed on Linux.

## Retrieval progress (2026-09-28)

Integrated through PR #28 (`e3d6558`), branched from `main` at `6fbd17a`, for the
optional roadmap step the user chose to do first. `fetch_history` reports
`Progress::Requesting` before each page request, with the category, page number,
and pages and records received so far. `Retrying` reports
`Progress::RetryPending` before each retry delay, including during validation.
Both take a `Report` (`&(dyn Fn(Progress) + Sync)`). Events hold categories and
counts only. This is native reporting only: the extraction commands pass a
no-op reporter, and forwarding events to the webview, with a cancel control,
is added to the acquisition commands step. Existing tests pass a shared no-op
reporter from the test doubles, so no unused closure lands in covered code.

TDD: a pagination test for the event sequence and totals, and a retry test that
events precede each wait and stop once the budget is spent, failed against
stubs that reported nothing, then passed.

`npm run check` passed: 106 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Account and server resolution (2026-09-28)

Integrated through PR #29 (`4e6fd32`), branched from `main` at `e3d6558`.
`fetch_history` now resolves the account while retrieving: the UID from
records and the server from each page's `region`. Values absent from a page add
no evidence; every value present must match the first, so another account or
server stops retrieval at once (`MixedAccounts`, `MixedServers`).
`History::account()` gives the `Account` to preview under, with redacted debug
output, or `None` when no records were retrieved, a normal "no history found"
outcome that creates no account. Records with no named server anywhere fail
with `MissingServer`. The synthetic `empty.json` fixture has no region, so
empty pages without one are accepted; the researched real responses did carry
region and offset on an empty page. The integration test now previews and
commits under the resolved account.

TDD: three tests (resolution across pages, mismatch stopping retrieval, missing
server) failed against a stub that never resolved an account, then passed. A
fourth, that no records gives no account, passed against the stub, as expected
of one returning none.

`npm run check` passed: 110 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Review DTO (2026-09-28)

Integrated through PR #30 (`0d8cdad`), branched from `main` at `4e6fd32`. Each storage
preview now carries a serializable `Review`: UID, server, timezone offset,
overall counts, counts for all six categories in fetch order (including empty
ones), the earliest and latest record times, and each conflict's ID, category
and time, with no payloads. At the user's choice it holds summary figures only.
A later extension to highlight 5-star characters and light cones is in the
deferred list; rarity, item type and name are already in every record, and only
banner meaning needs metadata. Failure indices for a failed preview are added to
the commands step, where preview errors reach the webview.

Refactors, with behaviour unchanged: `classify` returns each record's status,
and summaries and commit inserts derive from it; its unit tests now assert the
statuses, which state the old counts more precisely. `Category` moved to
`hsr.rs`, re-exported from `acquisition`, so storage need not depend on
acquisition.

TDD: a review test scripting a duplicate, a conflict and a new record across two
categories failed against a stub returning an empty review, then passed. The
integration test now also checks the review from real SQLite.

`npm run check` passed: 111 Rust unit tests, 35 integration tests, 43
frontend/tooling tests, offline native execution, nine probes and five report
checks, all at 100% per file, plus TypeScript/build, formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux.

## Acquisition session and cancel command (2026-09-28)

Integrated through PR #31 (`3479fbe`), branched from `main` at `0d8cdad`: PR A of
four for the acquisition commands, as agreed with the user. The session now
holds the validated context with the retry budget validation started, which
retrieval will continue with, and a cancellation token for the running
operation. Starting an operation cancels any earlier one's token, and a
validated context is kept only if its operation's token was not cancelled,
checked under the session lock, so a cancelled or superseded operation keeps no
late result. Validation runs through `Cancellable`. The new `cancel_acquisition`
command cancels the running operation and drops the context; it is registered
in the command manifest and granted to the main window. The typed client gains
`cancelAcquisition()` and the `cancelled` kind. No UI changed.

Agreed with the user for the remaining PRs: clear the auth key as soon as
retrieval ends rather than at commit; put all acquisition UI (progress, Cancel,
review, messages) in the controls step rather than in each command PR; and
report the failing category and page on retrieval failures instead of preview
indices, since retrieval already validates every page. The roadmap now lists
the commands step as four sub-steps with those requirements.

TDD: three session tests (cancel, late and superseded results, cancelling
mid-validation) failed against stubs, then passed; the mid-validation test uses
a transport that cancels the session after serving a response. The registration
and carried-budget assertions passed at once, as those parts were not stubbed.
Two client tests failed on the missing function and kind, then passed. The
native smoke test now calls `cancel_acquisition` from the real webview.

The first full run failed the backend unit branch gate on one of my test
assertions, `earlier.is_cancelled() && !later.is_cancelled()`, whose
short-circuit paths never ran; it is now two assertions. `npm run check` then
passed: 114 Rust unit tests, 35 integration tests, 44 frontend/tooling tests,
offline native execution including the new IPC call, nine probes and five
report checks, all at 100% per file, plus TypeScript/build, formatting and
Clippy. `npm run tauri -- build --no-bundle` passed on Linux.

## Local database (2026-09-28)

Integrated through PR #32 (`b6e279e`), branched from `main` at `3479fbe`: PR B of four
for the acquisition commands. `desktop::register` resolves Tauri's local app data
folder in its setup hook and manages a `Database` for `history.sqlite` there.
Nothing is created or opened until the first `Database::run`, which creates the
folder, opens the store and then reuses it. `run` executes on Tokio's blocking
pool. A missing or occupied folder, a failed open or a panic in the work gives
the safe storage `Database` error, and a panic drops the store so it reopens.
[Decision 0009](../../architecture/decisions/0009-local-database-location.md) records the location
(`%LOCALAPPDATA%\com.shra-ja.roll-tracker` on Windows, the XDG data folder on
Linux and WSL) and alternatives. The user chose the local folder over the first
proposed roaming `%APPDATA%`, so history never roams with a Windows profile. On
Linux the two folders coincide, so the registration test cannot tell them apart
here; the Windows location needs checking on Windows after the first import.
The roadmap gains the portable-mode item the user asked for, next in milestone 3.
No command uses the database yet.

Test support: the filesystem double gains `create_dir_all`, and the storage
tests' SQL-script helpers are crate-visible so desktop tests can script an open.
The registration test runs Tauri's setup hook through the deprecated
`App::run_iteration`, the only way under the mock runtime, with a
statement-level `#[allow(deprecated)]`.

TDD: three database tests failed against stubs, then passed; the thread test
opens the store on the test thread first, since the blocking thread cannot see
the thread-local doubles. The registration test failed while nothing managed
the database, then passed. A new integration test opens real SQLite in a new
nested temporary folder and passed on its first run, checking nothing exists
before first use.

The first full run failed the backend unit gate twice over. The no-op callback
passed to `run_iteration` never runs under the mock runtime, so it is now a named
function in `src/desktop/tests/events.rs`. And LLVM scores a generic function by
its best single instantiation: each test closure made a new `with_store`
instantiation, none covering every path, though together they did. `with_store`
now takes a boxed closure and its tests share one result type.

Two later full runs were cut short when the WSL VM crashed. Windows' event log
showed it running out of virtual memory, with `vmmemWSL` at 11.7 GB beside other
applications; the Linux journal had no out-of-memory kill or fault. The user
capped WSL at 8 GB with automatic memory reclaim. The check was then run stage by
stage with `CARGO_BUILD_JOBS=8`: every stage of `npm run check` passed (118 Rust
unit tests, 36 integration tests, 44 frontend/tooling tests, offline native
execution, nine probes and five report checks, all at 100% per file, plus
TypeScript/build, formatting and Clippy). Across the staged runs, use peaked at
about 3.4 GB, with at least 4.5 GB available; the final run followed the switch
to the local app data folder. An earlier staged attempt failed only the source-inventory
gate, which correctly flagged the staging script placed under `test-results/`; it
now lives outside the repository. `npm run tauri -- build --no-bundle` passed on Linux.
