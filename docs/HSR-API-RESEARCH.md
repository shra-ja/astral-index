# Honkai: Star Rail API research

Research performed 2026-09-19. Documentation updated 2026-09-21.

## What the cache is used for

The inspected `data_2` files contain previous API request URLs. Extracting those
URLs required neither Chromium block-header parsing nor decompression. Existing
authentication parameters can be reused in a user-requested API call; cache
extraction does not generate a key or establish its lifetime.

Local extraction from the original supplied cache found 414 candidates, all HTTPS
requests to `public-operation-hkrpg-sg.hoyoverse.com` at
`/common/hkrpg_gacha_record/api/getGachaLog`. Every candidate contained the five
context fields listed below. No `getLdGachaLog` candidate was found. Subsequent
user-authorized requests retrieved records and verified cursor pagination.

## Extraction and acquisition flow

1. **Locate game data**. Accept a user-selected cache or game-data directory.
   A discovery approach to validate on Windows is reading
   `%APPDATA%/../LocalLow/Cognosphere/Star Rail/Player.log` or `Player-prev.log`
   for `Loading player data from ` and removing that prefix and `data.unity3d`
   to obtain the directory. Automatic discovery has not been tested.
2. **Choose the cache**. Candidate locations are
   `<game-data>/webCaches/Cache/Cache_Data/data_2` and
   `<game-data>/webCaches/<version>/Cache/Cache_Data/data_2`.
   Version directory names have four numeric components; compare components
   numerically and verify file existence when implementing discovery.
3. **Read locally**. Read the selected cache without modifying the game files.
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
   parsing errors explicitly; authentication expiry behavior remains unverified.
7. **Advance and import**. Use the verified cursor sequence below for subsequent
   pages, then pass records through validation, preview, and transactional import.
   End-of-history rules and failure handling still require implementation tests.

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
| `gacha_type` | Select the desired banner type | User identifies six banner types; names, IDs, and mappings will be documented later. |
| `page` | Start at `1`, increment for each request | Tested through page 5 alongside an advancing `end_id`; incrementing page alone repeated records. |
| `size` | Up to `5000` tested | Requested page size; smaller pages with proper pagination may be preferable later. |

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
pagination strategy. End-of-history stop rules and banner details remain future work.

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
with supporting cache evidence for type 11. It does not establish whether
`page` is required when the cursor advances, behavior during concurrent new
rolls, or the correct end-of-history stop condition. The future client should
handle empty pages and repeated/nonadvancing cursors without looping forever;
those cases still need dedicated verification and synthetic tests.

## Translation into the application later

The requested future flow is: select/discover game data → read cache → extract
candidate URLs locally → acquire history from HoYoverse on user request → validate/normalize
responses → use the shared preview and transactional import pipeline. Keep the
Rust source reader and URL extractor separate from the future network client;
file import, stored-history browsing, analysis, and export remain local.
User-requested acquisition is an accepted product requirement, replacing the
assumption that cache files suffice for offline acquisition; see
[decision 0002](decisions/0002-user-requested-history-acquisition.md). No API
client is implemented in the app yet.

Implementation considerations:

- Reverse file order is not chronological order. Do not infer key age or validity
  from its position in the cache.
- Handle missing/short logs, missing caches, version selection, and file-read
  errors explicitly when implementing discovery.
- Bound file/response sizes, attempts, timeouts, and pagination. Ensure temporary
  copies are cleaned up on failure. Deduplicate repeated candidates to avoid
  redundant probes.
- Parse and allowlist HTTPS API hosts and exact endpoint paths before sending
  secrets, including redirect handling. Preserve query encoding.
- Keep auth keys and full URLs out of logs, error messages, fixtures, and the
  clipboard by default. Return safe status information to the UI. Account
  identity must come from verified response evidence, not cache ordering or
  an assumed current account.

Still to verify: response schema, account/server identity, stable roll IDs,
timezone semantics, endpoint/banner mapping, pagination edge cases and stop conditions,
expiry/error behavior, rate limits, and retention/completeness. Milestone 2's format-verification item remains open.

## Verification scope

These notes preserve the observed request behavior and comparison results without
requiring private research artifacts. No auth keys, account IDs, or actual roll
IDs are included. Windows discovery, pagination edge cases,
and history completeness remain untested. No executable project code changed,
so red/green testing is not applicable.
