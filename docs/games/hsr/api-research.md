# Honkai: Star Rail API research

Research performed 2026-09-19. Contract review updated 2026-09-24.

## Current contract

[Initial HSR API contract](api-contract.md) is the implementation reference.
It inventories all fields in 12 saved response bodies, documents supported banner
codes, and records the user's accepted assumptions for the single tested endpoint,
stable identity, auth-key account selection, server time, pagination and complete
retained history. It also defines a low-request, bounded-retry policy and the
observed expired-key response. The app implements it, and the account and server
mapping was verified end to end before milestone 7 closed.

The dated observations below remain research evidence. Earlier statements that
verification blocks milestone 2 are superseded by the accepted contract; they
must not be read as additional prerequisites or as proof of unobserved behaviour.

## What the cache is used for

The inspected `data_2` files contain previous API request URLs. Extracting those
URLs required neither Chromium block-header parsing nor decompression. Existing
authentication parameters can be reused in a user-requested API call; cache
extraction does not generate a key or establish its lifetime.

Local extraction from the original supplied cache found 414 candidates, all HTTPS
requests to `public-operation-hkrpg-sg.hoyoverse.com` at
`/common/hkrpg_gacha_record/api/getGachaLog`. Every candidate contained the five
context fields listed below. No `getLdGachaLog` candidate was found then; the
[collaboration endpoint](#collaboration-endpoint-2026-09-29) was found later. Subsequent
user-authorized requests retrieved records and verified cursor pagination.

## Extraction and acquisition flow

1. **Locate game data automatically on request**. Read
   `%APPDATA%/../LocalLow/Cognosphere/Star Rail/Player.log` or `Player-prev.log`
   for the line starting `Loading player data from` (and a space), removing that prefix and `data.unity3d`
   to obtain the directory (verified against real installations on 2026-09-27;
   see below). If discovery fails, accept a user-provided file directly for extraction.
2. **Resolve `data_2` internally**. Candidate locations are
   `<game-data>/webCaches/<version>/Cache/Cache_Data/data_2`. The unversioned
   `<game-data>/webCaches/Cache/Cache_Data/data_2` layout is not supported.
   Version directory names have four numeric components; compare components
   numerically and verify file existence. Only the two newest version folders
   are candidates: the user reports auth keys last about 24 hours, so older caches cannot hold a
   valid key. This is internal resolution, not a user choice.
3. **Read locally**. Read discovered `data_2` or the provided fallback file
   without modifying game files.
   If a temporary copy is needed, clean it up on success and failure.
4. **Extract candidates**. The tested method reads UTF-8 text, splits on `1/0/`,
   and scans segments in reverse order for history-request URLs, taking the
   text up to the first NUL. Parse and validate the resulting URL before use;
   reverse file order does not establish chronological order or key validity.
5. **Construct the request**. Preserve `authkey`, `authkey_ver`, `sign_type`,
   `game_biz`, and `lang` with correct query encoding. Add `gacha_type`, `page`,
   `size`, and `end_id` using the tested recipe below. Keep credentials in the
   native backend rather than printing or copying the URL to the clipboard.
6. **Fetch on user request**. Validate the HTTPS host and endpoint, request the
   JSON response, and check HTTP status and `retcode`. A zero return code alone
   does not establish that any records were returned. Handle network, API, and
   parsing errors explicitly; the expired-key response is documented below.
7. **Advance and import**. Use the verified cursor sequence below for subsequent
   pages, then pass records through validation, preview, and transactional import.
   The contract now settles end-of-history rules and failure handling.

## Tested request parameters and working assumptions

User-authorized tests on 2026-09-19 established that the following nine-field
query is sufficient to retrieve records from the observed `getGachaLog` endpoint.
This is a working request recipe, not proof that each field is individually
required or a complete API specification.

| Parameter | Working value / handling | Interpretation and evidence |
| --- | --- | --- |
| `authkey` | Reuse from the cached request | Authentication credential; preserve during retrieval, refresh from the game when no longer valid. Do not hardcode it as a permanent constant. |
| `authkey_ver` | Preserve cached value (`1` tested) | Authentication-key version; treated as part of authentication. |
| `sign_type` | Preserve cached value (`2` tested) | Treated as part of authentication; exact semantics unknown, no changes or further investigation needed now. |
| `game_biz` | `hkrpg_global` | Working interpretation: Honkai: Star Rail global service. |
| `lang` | `en` | English language context. |
| `end_id` | `0` initially; then the preceding page’s last record ID | Pagination cursor; preserve the ID as a string. Advancing it worked in the five-page test below. |
| `gacha_type` | Select the desired banner type | User identifies six banner types; the [contract](api-contract.md#known-banner-categories) lists them. |
| `page` | Start at `1`, increment for each request | Both increasing and fixed `page=1` returned identical records with advancing `end_id` in the 2026-09-23 test; keep incrementing to mirror the in-game requests observed in the supplied cache. |
| `size` | Up to `5000` tested | Requested page size; the contract settled on `1000` with cursor pagination. |

Treat the first five fields as stable request context for a retrieval session,
with authentication values copied from the cache. Vary banner selection and
pagination as needed; advance `end_id` when requesting subsequent pages.

The original cached request returned records. A five-field shortened
URL returned HTTP 200 and `retcode: 0` but no items. Adding `page`, `size`,
`end_id`, and `gacha_type` retrieved records successfully. Types `1` and `11`
returned data; changing only the original request's `gacha_type` to `13` returned
an empty list, which does not establish the meaning or validity of type `13`.

Tests requested sizes `10`, `100`, and `1000` for type `1`, and `1000` and `5000`
for type `11`. All returned HTTP 200 with `retcode: 0`; some filled the requested
size and others returned fewer items. The user expects page 1 with size 5000
to typically cover their account, but complete history and a server-side maximum
have not been established. Do not treat this large-page shortcut as a verified
pagination strategy. The contract settles the stop rule and page size.

## Pagination evidence (2026-09-19)

Three observations supersede the earlier assumption that `end_id` could stay zero:

| Test / source | Parameters | Result |
| --- | --- | --- |
| Initial five-request test | Type `1`, size `10`, pages `1`–`5`, fixed `end_id=0` | Every page returned the same first ten records: 50 entries, only 10 unique IDs. |
| Replacement cache after the user visited three in-game pages | Type `11`, size `5`, pages `1`–`3` | Exactly three history-request URL occurrences. Page 1 used `end_id=0`; pages 2 and 3 used IDs matching records 5 and 10 of the earlier type-11 response. |
| Five-request retest | Type `1`, size `10`, pages `1`–`5`, advancing `end_id` | 50 unique records, exactly matching the first 50 of the earlier size-100 response in order and every field. |

Both five-request tests returned HTTP 200 and `retcode: 0` on every page, with
10 records per response. Requests were sequential, with a one-second pause
between calls and no retries. Comparison used the first 50 records of the
earlier successful type-1 request with `page=1`, `size=100`, and `end_id=0`.

The tested retrieval sequence is:

1. Keep the five context fields, selected `gacha_type`, and `size` fixed.
2. Start with `page=1` and `end_id=0`.
3. After a successful nonempty response, take the last record's `id` as a string.
4. Increment `page` and use that ID as the next request's `end_id`.

This verifies advancement through five pages for the sampled type-1 history,
with supporting cache evidence for type 11. The later page-parameter comparison below isolates the effect of incrementing
`page`. Concurrent new-roll behaviour and end-of-history semantics were not
established by this five-page test. The client ends a category on an empty page
and rejects repeated cursors, with synthetic tests for both.

## Page parameter comparison (2026-09-23)

The user supplied an updated cache and explicitly requested a repeat of the
five-page, size-10 cursor test with incrementing versus fixed page numbers.
Local extraction found three matching URLs and one distinct five-field request
context. Credentials were read locally and sent only to the tested HTTPS endpoint;
no token-bearing URLs or private identifiers are included here.

Both runs queried category `1` with `size=10`, starting at `end_id=0` and advancing
to each preceding response's last record ID. All other request context stayed
fixed. The incrementing run completed first, then the fixed run restarted at
cursor `0`. Requests were sequential, one second apart, with no automatic retries.
An initial sandbox network failure produced no response; the permitted network
run then completed all ten requests successfully.

| Run | Requested `page` values | Result |
| --- | --- | --- |
| Incrementing | `1`, `2`, `3`, `4`, `5` | Five successful pages, ten records each, 50 unique IDs. |
| Fixed | `1`, `1`, `1`, `1`, `1` | Five successful pages, ten records each, the same 50 unique IDs. |

Every response had HTTP 200 and `retcode: 0`. Corresponding pages and concatenated
records matched in order and every record field. Full response objects were also
identical except `data.page`, which echoed the requested page string on steps
2–5. Raw responses and the comparison are retained only in ignored local storage.

For this endpoint, category and sampled five-page sequence, advancing `end_id`
was sufficient: incrementing `page` did not change which records were returned.
Together with the earlier fixed-cursor test, this supports treating `end_id` as
the pagination control. The follow-up below tests omission separately. Arbitrary page values and
other categories/server versions remain outside the comparison. The initial contract can retain incrementing page numbers for compatibility;
no additional probe or change to the application's code is needed for this result.

### Omitting page (2026-09-23)

At the user's request, a third run omitted the `page` query parameter entirely.
It used the same cache context, category `1`, `size=10`, initial `end_id=0` and
last-record cursor advancement. Five sequential requests, one second apart and
without retries, all returned HTTP 200, `retcode: 0` and ten records.

The resulting 50 unique records matched both previous runs in order and every
field. Each response reported `data.page` as the string `"0"`. After removing that
metadata field, full responses matched the fixed-`page=1` run exactly. Thus, for
this sampled sequence, `page` is optional and does not control which records are
returned; the cursor is sufficient. This finding does not establish behaviour
for other categories or arbitrary invalid parameter values. Private response
bodies and the comparison remain in ignored local storage.

### Incrementing page without end_id (2026-09-23)

A fourth user-requested run omitted `end_id` entirely and incremented `page` from
1 to 5, keeping category `1`, `size=10` and the same authentication context.
All five sequential requests returned HTTP 200, `retcode: 0` and ten records.
Requests were one second apart, with no retries and a fixed five-request limit.

Every returned list matched the first page of the earlier cursor runs exactly,
in order and every record field: 50 returned entries contained only 10 unique
roll IDs. `data.page` echoed `"1"` through `"5"`, despite the repeated records.
This demonstrates that incrementing `page` alone does not advance this sampled
history, even when `end_id` is absent rather than explicitly `0`. Advancing the
cursor is necessary for the tested pagination recipe; response page metadata is
not evidence of record progress. Raw results remain in ignored local storage.

### In-game page convention in the supplied cache (2026-09-23)

A read-only inspection of the updated `data_2` found three requests to the tested
endpoint, all for category `11` with `size=5`:

| Requested `page` | Requested `end_id` |
| --- | --- |
| `1` | `0` |
| `2` | First nonzero cursor |
| `3` | A different nonzero cursor |

Cursor values are deliberately omitted here. The request parameters show that
the in-game client increments `page` while changing `end_id`; this conclusion
does not depend on treating cache byte order as a timestamp. No network requests
were needed for this inspection. Follow the observed client convention: send
`page=1` initially and increment it whenever requesting the next cursor page,
although the live comparison establishes that cursor advancement alone works
for the tested sequence. `end_id` remains the actual pagination control.

## Expired-key response (2026-09-24)

At the user's explicit request, one request reused the auth key from the supplied
cache with category `1`, `size=1000`, `page=1` and `end_id=0`. The response was
HTTP 200 with `retcode: -101`, message `"authkey timeout"` and `data: null`.
No retry was made. This establishes an observed expired-key response, not a
measured authentication-key lifetime or every possible authentication error code.

The client must inspect `retcode` even when HTTP succeeds. On `-101`, stop without
retrying or committing history and ask the user to refresh the key. Match the
numeric code rather than requiring the diagnostic string. No credentials,
request URL or private history are included in this evidence.

## Collaboration endpoint (2026-09-29)

Windows testing of the first complete retrieval found no records for categories
`21` and `22`, although the account has collaboration rolls; the other categories
matched the game. The user then opened both collaboration histories in the game.
A read-only scan of the updated `data_2`, printing only hosts, paths, parameter
names and `gacha_type`, `game_biz` and `lang` values, found:

| Path | `gacha_type` | Requests |
| --- | --- | --- |
| `/common/hkrpg_gacha_record/api/getGachaLog` | `1`, `11` | 2 |
| `/common/hkrpg_gacha_record/api/getLdGachaLog` | `21` (3), `22` (2) | 5 |

Both paths used the same host and the same query parameter names. Every request
carried a distinct auth key (seven in all; compared for equality only), so the
cache could not show whether one key serves both endpoints.

With the user's authorization, three paced requests (`size=5`, `page=1`,
`end_id=0`, redirects disabled) were sent using the newest cached key of each
kind. Only status, `retcode`, `message`, field names and value types were
printed; raw responses were not saved.

| Request | Outcome |
| --- | --- |
| `getGachaLog` key to `getLdGachaLog`, type `21` | HTTP 200, `retcode 0`, 5 records, all `gacha_type` `21` |
| `getLdGachaLog` key to `getGachaLog`, type `1` | HTTP 200, `retcode 0`, 5 records, all `gacha_type` `1` |
| `getLdGachaLog` key to `getLdGachaLog`, type `22` | HTTP 200, `retcode 0`, 5 records, all `gacha_type` `22` |

All three had the same shape as `getGachaLog` responses: `data` with string
`page` and `size`, string `region`, integer `region_time_zone`, the record `list`
and an empty `list_v2`; records with string `uid`, `gacha_id`, `gacha_type`,
`item_id`, `count`, `time`, `name`, `lang`, `item_type`, `rank_type` and `id`. So
collaboration categories use `getLdGachaLog`, keys work across both endpoints,
and the parser needs no change. The earlier note that no `getLdGachaLog`
candidate was found reflected a cache without collaboration history requests.

### Collaboration page size

With the endpoint corrected, a Windows retrieval returned exactly 20 records for
each collaboration category, far fewer than the account has. With the user's
authorization, fifteen further requests (one second apart, redirects disabled)
fetched five cursor-advanced pages of type `21` from `getLdGachaLog` at each of
`size=5`, `20` and `1000`, using the newest cached collaboration key. Only
counts, echoed metadata and comparison results were printed; responses were not
saved.

| Requested `size` | Records per page | Echoed `data.page` | Echoed `data.size` |
| --- | --- | --- | --- |
| `5` | 5 on each page | `"1"` to `"5"` | `"5"` |
| `20` | 20 on each page | `"1"` to `"5"` | `"20"` |
| `1000` | 20 on each page | `"1"` to `"5"` | `"20"` |

Each run's IDs were unique and strictly descending, and every record had type
`21`; `list_v2` was always empty. The first 25 records were identical in order
and every field across all three sizes, and the first 100 identical between
sizes `20` and `1000`. So `getLdGachaLog` caps pages at 20 and reports the cap in
`data.size`, and the page size changes only how records are split, not which
records are returned. The game's own cached requests use `size=5` on both
endpoints, so the cache gives no evidence of the cap.

Comparing pages with the echoed size instead of the requested one failed at once
on Windows: the first Stellar page was rejected as unreadable. Every saved
`getGachaLog` response from the 2026-09-19 research echoes `size` as `"0"`,
whether 10, 100, 1000 or 5000 was requested and whether the page was full (for
example, 1000 records for type `11` at `size=1000`, and 221 for type `1`). The
echo is therefore endpoint-specific and not a usable measure. Pagination now ends
a category only on an empty page, ignoring the echo.

## Verification scope

These notes preserve the observed request behavior and comparison results without
requiring private research artifacts. No auth keys, account IDs, or actual roll
IDs are included. Installation discovery was verified later (below); history
completeness remains an accepted assumption, not an observation.

## WSL installation verification (2026-09-27)

The user ran the desktop app from WSL (Ubuntu, with Windows interop) against a
real Honkai: Star Rail installation on Windows, installed at a custom location on
drive D:. Only outcome categories, yes/no answers and version-folder names were
reported; no paths, usernames, URLs, keys or file contents were shared or stored.

| Check | Result |
| --- | --- |
| Automatic search, game closed, warp history opened recently | Success: a request was found. |
| Automatic search, game running, warp history just opened | Success. Reading `data_2` was not blocked while the game ran. |
| `webCaches` layout | Several version folders (for example `2.47.0.0`, `2.49.0.0`, `2.53.0.0`), each with a `Cache` folder directly inside. No unversioned `webCaches/Cache` folder. |
| Latest version's `data_2` renamed | Automatic search still succeeded, from an older version's cache. This led to the two-version window (PR #10). |
| File fallback, choosing the latest `data_2` directly | Success. The chooser then misleadingly showed "no file selected", fixed in PR #11. |

This establishes, for WSL:

- Current-user AppData lookup through PowerShell, `wslpath` translation, player-log
  discovery, a custom-drive game path and versioned `webCaches` resolution work on
  a real installation.
- Cache reads succeed while the game is running.
- The file fallback extracts from a real `data_2`.

It does not establish:

- Which of the two logs supplied the game path, or which version's cache was used:
  the app deliberately reports neither.
- That the automatic runs match the current two-version window: they used a build
  from before PR #10. The latest version held a cache, which both rules try first,
  so the outcome should be unchanged, but it was not re-run.
- Key validity: no history request was made.
- Native Windows behavior, which remains pending.

## Native Windows verification (2026-09-27)

The user ran a Windows build of the app, started from Windows Explorer, against
the same installation. The executable was cross-compiled from WSL with
`cargo-xwin` 0.23.1 for `x86_64-pc-windows-msvc`, after the user accepted the
Microsoft Build Tools license terms that `cargo-xwin` relies on. The build needed
a Windows icon, `icons/icon.ico`, generated from the existing `source.svg`. This
build included the two-version window and the always-visible file chooser.

| Check | Result |
| --- | --- |
| Automatic search, game closed, warp history opened recently | Success: a request was found. |
| Automatic search, game running, warp history just opened | Success. Reads were not blocked while the game ran. |
| File fallback, choosing the latest `data_2` directly | Success, and the chosen file name stayed shown. |
| Windows SmartScreen | Did not block the unsigned executable. |

This establishes that Known Folder AppData lookup, player-log discovery, the
two-version cache window and the file fallback work in a native Windows process,
with the current code. It does not establish that the project builds with the
native Windows toolchain, installer packaging or signing, which belong to
milestone 6's release validation. The tested executable also opened a console
window beside the app, because `main.rs` did not select the Windows GUI
subsystem; release builds now select it. As with WSL, no history request was made and the app reports neither
the log nor the cache version it used.

## Supported and unsupported extraction sources (2026-09-27)

| Source | Status | Evidence |
| --- | --- | --- |
| Automatic discovery on native Windows | Supported | [Native Windows verification](#native-windows-verification-2026-09-27) |
| Automatic discovery from WSL with Windows interop | Supported | [WSL verification](#wsl-installation-verification-2026-09-27) |
| Game installed on a custom drive | Supported | Both runs used a custom-drive installation. |
| Reading while the game is running | Supported | Both runs. |
| Versioned `webCaches/<version>` caches, two newest versions | Supported | Both runs; window verified natively on Windows. |
| User-chosen `data_2` file | Supported | Both runs. |
| Unversioned `webCaches/Cache` layout | Unsupported by decision | Assumed absent from current installations (PR #10). |
| Caches older than the previous game version | Unsupported by decision | Keys last about 24 hours, as the user reports (PR #10). |
| Linux without WSL, or WSL without `WSL_DISTRO_NAME` | Automatic search unsupported | Reports `unsupported_host`; the file chooser remains available. |
| macOS | Unsupported | Not implemented. |
| Redirected roaming profiles, other game regions/clients | Unverified | Not tested. |
