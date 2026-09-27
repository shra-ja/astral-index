# Honkai: Star Rail API research

Research performed 2026-09-19. Contract review updated 2026-09-24.

## Current contract

[Initial HSR API contract](HSR-API-CONTRACT.md) is the implementation reference.
It inventories all fields in 12 saved response bodies, documents supported banner
codes, and records the user's accepted assumptions for the single tested endpoint,
stable identity, auth-key account selection, server time, pagination and complete
retained history. It also defines a low-request, bounded-retry policy and the
observed expired-key response. Account/server verification finishes at the
end of milestone 3. Milestone 2's contract work is complete under that scope.

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
context fields listed below. No `getLdGachaLog` candidate was found. Subsequent
user-authorized requests retrieved records and verified cursor pagination.

## Extraction and acquisition flow

1. **Locate game data automatically on request**. Read
   `%APPDATA%/../LocalLow/Cognosphere/Star Rail/Player.log` or `Player-prev.log`
   for `Loading player data from ` and removing that prefix and `data.unity3d`
   to obtain the directory. Native helpers have synthetic test coverage; real
   Windows/WSL installation verification and end-to-end wiring remain pending.
   If discovery fails, accept a user-provided file directly for extraction.
2. **Resolve `data_2` internally**. Candidate locations are
   `<game-data>/webCaches/Cache/Cache_Data/data_2` and
   `<game-data>/webCaches/<version>/Cache/Cache_Data/data_2`.
   Version directory names have four numeric components; compare components
   numerically and verify file existence. This is internal resolution, not a
   user choice; version order does not establish credential age.
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
| `page` | Start at `1`, increment for each request | Both increasing and fixed `page=1` returned identical records with advancing `end_id` in the 2026-09-23 test; keep incrementing to mirror the in-game requests observed in the supplied cache. |
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
with supporting cache evidence for type 11. The later page-parameter comparison below isolates the effect of incrementing
`page`. Concurrent new-roll behaviour and end-of-history semantics were not
established by this five-page test. The future client should
handle empty pages and repeated/nonadvancing cursors without looping forever;
those cases still need dedicated verification and synthetic tests.

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

## Translation into the application later

The requested future flow is: automatically discover and read `data_2` (or read
a user-provided fallback file) → extract candidate URLs locally → acquire history
from HoYoverse on user request → validate/normalize
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
expiry/error behavior, rate limits, and retention/completeness. These were the open research questions before the 2026-09-23 contract decision.

## Verification scope

These notes preserve the observed request behavior and comparison results without
requiring private research artifacts. No auth keys, account IDs, or actual roll
IDs are included. Windows discovery, pagination edge cases,
and history completeness remain untested. No executable project code changed,
so red/green testing is not applicable.

## Response foundation review (2026-09-21)

The [UIGF API collection's HSR section](https://uigf.org/zh/mihoyo-api-collection/hoyolab/user/game_account_info.html#获取跃迁记录)
documents an envelope with numeric `retcode`, a message, and `data.list`.
Records carry string UID, record/pool/item IDs, banner, quantity, local timestamp,
localized labels, language and rarity. Page context includes region and a numeric
UTC offset. Its table and example disagree on page/size types, and its older
China endpoint/size limit do not establish the current global contract.

The [UIGF v4.2 contract](https://uigf.org/en/standards/uigf.html) supplies the six
supported HSR categories and string record identity constraints; it does not
specify the live API or guarantee completeness.

Application policy for this increment:

- Parse bounded response bytes in Rust, independent of acquisition or storage.
  Accept only integer zero as success; preserve any nonzero code as an API error
  without echoing messages, JSON errors, or payloads.
- Preserve record order, all documented record strings, leading zeros, long IDs,
  unknown item IDs, duplicates, conflicting records, and unknown page/record fields
  for future reconciliation.
  Require one UID per page. UID is response evidence; no UID is inferred on empty pages.
- Retain optional region/offset evidence. Unknown evidence remains unknown; never
  infer server from UID, or timezone from device settings. Validate an explicit
  whole-hour offset within -12 through +14 as application policy. Do not derive UTC.
- Validate calendar timestamps with exact spelling, rejecting leap seconds and
  impossible dates. Support count `"1"`, rarity `"3"`–`"5"`, and UIGF HSR banner
  categories; reject unsupported values rather than reinterpret them.
- Limit each body to 2 MiB. The future transport must also enforce the bound while
  receiving bytes. Ignore transport page/size metadata for pagination decisions.
- Missing success data or list is malformed, never end-of-history. Future fetching
  must distinguish success from errors, reject repeated/nonadvancing cursors and
  bound total requests. The current contract stops on any successful page shorter
  than the requested size, including an empty page; no follow-up request is needed.

No live calls were made for this review. Synthetic tests verify application
policy, not external compatibility. Current global response variants, stable ID
semantics across all categories, server/offset evidence, terminal pages, expiry,
rate limits and retention remain unverified. This was the basis for keeping the roadmap item open at that date; the accepted
2026-09-23 contract now supplies its initial implementation scope. The parser is not yet connected to the desktop shell or a network client.

## Initial source-reader increment (2026-09-25)

The native reader now supports an explicitly supplied regular cache-file path.
Synthetic tests on the Ubuntu development environment verify real file reads,
unchanged file bytes, binary surroundings, the researched `1/0/` and NUL framing,
encoded request fields, distinct candidates and bounded failures. This implements
the extraction method described above; it does not independently revalidate a
live installation or credential validity. No private source or live API was used.

| Source | Current support and evidence |
| --- | --- |
| User-provided cache file (fallback) | Native service implemented; framing supported by earlier cache research and local synthetic file tests. File-upload UI pending. |
| Internally resolved Windows game-data directory / versioned `webCaches` paths | Native resolver implemented; synthetic directory tests verify numeric ordering, legacy paths and missing caches. Native Windows and real WSL-mounted installation verification pending. |
| Windows installations accessed from WSL | Explicit mount-root mapping and current-user folder/path lookup implemented. Mocked OS and synthetic subprocess tests pass; real Windows interop/installation verification pending. |
| Windows Player.log / Player-prev.log discovery | Bounded reader supports supplied AppData and current-user Known Folder lookup. Script inspection and synthetic tests support the layout; native Windows and real installation verification pending. |
| macOS installation discovery | Unverified and unimplemented. |

Windows is the initial game-installation target, with discovery intended from
Windows and WSL. Keep milestone 3's OS-discovery verification item open until
real installations and native Windows file behavior are validated.


## Player-log reader increment (2026-09-26)

Inspection of the beginning of the user-provided PowerShell reference confirms
that it obtains Windows' roaming `ApplicationData` folder through the folder API,
then looks in sibling `LocalLow/Cognosphere/Star Rail`. It reads the first
11 lines for `Loading player data from ` and the `data.unity3d` path.
The script was inspected, not executed; this is evidence of its discovery method,
not independent verification against an installed game.

The native service now accepts that AppData location explicitly, checks both logs
independently, bounds header input to 64 KiB, and validates paths before returning
candidates. WSL callers supply a host-native AppData path and explicit mount root.
Microsoft documents that WSL's default `/mnt/` automount root
[can be changed or automount disabled](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#automount-settings),
so the service does not hard-code it or infer drive availability.
Synthetic tests cover Unicode/spaces, normalized drive letters/separators, custom
mount roots, missing/malformed logs, line/byte bounds, and read-only traversal
from a log candidate to a selected cache. System-folder integration, desktop
selection and native Windows/live-installation verification remain pending.


## Current-user discovery increment (2026-09-26)

The current-user service now supplies the previously explicit AppData location.
On Windows, `dirs` 6.0.0 uses the
[Known Folder API for roaming AppData](https://docs.rs/crate/dirs/6.0.0/source/src/win.rs).
On WSL-marked Linux, a fixed PowerShell expression queries the Windows folder,
then `wslpath` translates AppData and the game-directory candidates. Microsoft
documents [Windows executable interop and path translation](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop#path-translation).
No Windows username or common mount root is inferred.

The helper policy is five seconds per execution, 32 KiB stdout, discarded stdin/
stderr, and up to five seconds for error cleanup. Processes are terminated and
reaped after errors; cancellation uses Tokio's kill-on-drop behavior. Tests use
mocked environment/folder/process APIs and separate synthetic Linux executables,
including failures, large output, timeouts, real cleanup and unchanged log bytes.
No live Windows helper, private profile or game log was used in automated tests.

Automatic discovery requires Windows, or Linux with nonempty `WSL_DISTRO_NAME`
and working `powershell.exe`/`wslpath` on PATH. Missing interop/tools and malformed,
non-Unicode, relative or UNC/device folder paths produce safe errors. Explicit
file upload remains the fallback. Redirected roaming profiles whose logs
are not in the derived sibling LocalLow location are not verified.
Real Windows Known Folder behavior, WSL Windows-process cancellation, actual
game-log/cache layouts and desktop extraction controls remain to be verified/connected.
