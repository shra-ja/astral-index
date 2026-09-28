# Initial HSR history API contract

Accepted initial scope: 2026-09-23; updated 2026-09-24, based on the user's implementation assumptions,
the saved 2026-09-19 responses and [research](HSR-API-RESEARCH.md). This is the
application's working contract, not an official HoYoverse specification.

## Endpoint and request

Use only HTTPS GET to `public-operation-hkrpg-sg.hoyoverse.com`, path
`/common/hkrpg_gacha_record/api/getGachaLog`. Treat this as the sole endpoint for
all six categories below. No alternate endpoint discovery or proxy is required.
Reject redirects outside this endpoint rather than forwarding credentials.

| Query field | Contract |
| --- | --- |
| `authkey` | Opaque credential supplied by the user/cache; determines the account for this acquisition session. Preserve encoding and keep it out of logs, fixtures and durable history. |
| `authkey_ver` | Preserve cached authentication version; `1` worked in research. |
| `sign_type` | Preserve cached signature mode; `2` worked. Its internal meaning is outside this contract. |
| `game_biz` | `hkrpg_global` for the tested global service. |
| `lang` | Preserve requested language; `en` was tested. Keep it fixed during acquisition. |
| `gacha_type` | One of the string category codes below; query each known category separately. |
| `page` | Optional in the sampled cursor test: omission returned identical records. Send it to mirror the observed in-game client: start at `1` and increment after full pages. |
| `size` | Default to `1000` records per request. `5000` is the largest tested value, not the default or a proven server maximum. Pagination retrieves remaining records; no higher-limit testing is required. |
| `end_id` | String `0` initially, then the preceding successful page's last record ID, unchanged. Omitting it while incrementing `page` repeated the first ten records in all five test requests. |

These nine fields form the working request recipe. `page` was also successfully
omitted in the sampled test; necessity of the other individual fields has not
been isolated.

### Auth-key validation

Before building paged requests, validate extracted contexts in reverse file
order, matching the researched extraction method. Newer cache entries often sit
later in the file, but byte position is not chronological, so reverse order only
reduces expected requests; it does not establish key age or validity. Validate
at most five distinct contexts per acquisition.

Send each context's cached request unchanged, after the same URL and
endpoint validation as every other request. Use the first context whose request
returns `retcode: 0` with a valid response page. Assume one cache file holds
requests for a single account. Do not import records from the validation
response; pagination retrieves them.

An expired key (`-101`) or any other nonzero `retcode` rejects that context, and
validation moves to the next one. If no validated context works, or the
five-context limit is reached, stop with an actionable error without writing
history. Report an expired key if any context returned `-101`, and ask the user
to refresh the key by opening the in-game warp history. Otherwise report the
first nonzero code returned. Any other failure (a rate limit, transient or
rejected response, invalid data, or an internal error) stops validation without
trying further contexts. Transient failures use
the retry policy below and count toward the acquisition's retry budget. A
rate-limit error or an exhausted budget stops acquisition. Validation makes one
request per context, and it is the only request made before pagination.

Validation runs in the same user action as extraction, not as a later step.
Extraction stays a local function and validation a network function, composed by
the command. Only the first working context is kept, for pagination; every other
extracted context and cached URL is dropped as soon as validation ends, whether it
succeeds or fails. The action therefore contacts HoYoverse, so the interface must
present it as starting history retrieval, not as a local-only search. See
[decision 0007](decisions/0007-validate-during-extraction.md).

## Observed response fields

The initial read-only inventory of 12 saved response bodies found the fields below. All
had integer `retcode: 0`; one had an empty `list`. Every page had region and offset
context. All nonempty lists carried one common UID and all page offsets were `1`.
Only categories `1` and `11` occurred. This inventory records shapes and aggregate
evidence only; no account IDs, roll IDs, credentials or player histories are copied
into the repository. All saved timestamps were calendar-valid in the stated format.

| Envelope field | Observed JSON type | Meaning and handling |
| --- | --- | --- |
| `retcode` | Integer | API outcome; exactly `0` means success. Any nonzero value aborts acquisition and is never interpreted as empty history. |
| `message` | String | Server diagnostic text. Not an identifier or a success discriminator; never display/log raw source text. The parser does not require it. |
| `data` | Object | Success payload. Required on success; may be absent on error. |

| `data` field | Observed JSON type | Meaning and handling |
| --- | --- | --- |
| `page` | String | Echoed the requested page number in the 2026-09-23 comparison; returned `"0"` when the query parameter was omitted. Do not use it instead of the client's own cursor state. |
| `size` | String | Page-size metadata; not proof of a maximum or total history length. |
| `list` | Array of records | Authoritative roll collection for this initial contract; preserve order. Required on success, even when empty. |
| `region` | String | Server/region identifier supplied by the response. Preserve the value; do not infer it from UID. |
| `region_time_zone` | Integer | Treat as the server's UTC offset in hours. Samples consistently provide `1`. |
| `list_v2` | Array, always empty in the saved samples | Purpose and element format are unknown. Assume it is always empty for the initial implementation; use `list` for roll history. |

All record fields below were present as JSON strings. Numeric-looking identifiers
remain strings, including leading zeros; no floating-point conversion is allowed.

| Record field | Meaning | Initial handling |
| --- | --- | --- |
| `uid` | Account/game UID in the response | Preserve; require nonempty ASCII digits and consistent UID within a page. Not the auth key or a separate service login. |
| `id` | Individual roll-record identity | Assume stable; preserve 1–19 ASCII digits. Its internal encoding is not interpreted. Also supplies the next pagination cursor. |
| `gacha_id` | Individual pool identifier, distinct from banner category | Preserve nonempty string; sufficient for initial import. Banner metadata lookup is deferred; do not derive pity rules from the ID alone. |
| `gacha_type` | Banner category code | Require a supported code from the table below. |
| `item_id` | Game item identifier | Assume stable; preserve nonempty string. An unfamiliar catalogue ID is allowed and does not trigger a dictionary request. |
| `count` | Quantity in this roll entry | Current supported value is `"1"`; other values abort validation. |
| `time` | Server-local time of the roll | Preserve exact `YYYY-MM-DD HH:MM:SS` text; require calendar validity and reject leap seconds. |
| `name` | Localised item display name | Preserve string; never use as identity. |
| `lang` | Record language | Preserve nonempty string. |
| `item_type` | Localised item-category label | Preserve string; do not use as an ID or infer banner rules from it. |
| `rank_type` | Item rarity | Current supported values are `"3"`, `"4"`, `"5"`. |

The record/pool/item distinction and six category codes align with
[UIGF v4.2](https://uigf.org/en/standards/uigf.html). UIGF is an interchange
reference, not evidence of live API behaviour. Unknown record extensions remain
part of the exact stored payload. Numbers retain arbitrary precision through
parsing, storage and export serialization; they are never rounded to floating
point. Equality compares the preserved serialized number representation, not
mathematical equivalence: differently spelled decimals such as `1.0` and `1.00`
may conflict even when mathematically equal. JSON formatting and object-member
order are not identity evidence. Duplicate members anywhere in a response,
including extension objects, are rejected before decoding. The internal Serde
number-marker key `$serde_json::private::Number` is also rejected to prevent a
source object from being reinterpreted as a number. Nested validation is bounded;
excessively nested input fails safely. Timestamps must have exactly the 19-byte
ASCII `YYYY-MM-DD HH:MM:SS` shape and a valid calendar value; signed or extended
years are rejected without imposing a game-launch cutoff.

Page extensions remain available during parsing
but are not durable snapshots. The parser currently treats `page`, `size` and
`list_v2` as untyped extensions. No special `list_v2` handling is required under
the always-empty assumption. Region and offset may be
absent/null in the existing parser; missing evidence stays unknown.

## Known banner categories

| Code | In-game banner label | Saved response evidence |
| --- | --- | --- |
| `1` | Stellar Warp | Nonempty lists observed. |
| `2` | Departure Warp | No sampled records. |
| `11` | Character Event Warp | Nonempty lists observed. |
| `12` | Light Cone Event Warp | No sampled records. |
| `21` | Character Collaboration Warp | No sampled records. |
| `22` | Light Cone Collaboration Warp | No sampled records. |

Banner labels use the official in-game terminology supplied by the user. The
UIGF enum establishes the six recognised category codes. An empty result
for the earlier experimental code `13` does not make it a supported category.
Metadata mapping individual `gacha_id` pools to banners will be sourced later,
alongside milestone 4's banner work. The supplied pool ID is sufficient for initial
import; imports must not depend on metadata lookup or trigger metadata requests.
No pity grouping or guarantee rule follows from this table.

## Identity and mismatch handling

A roll's `id` never changes, and the roll is an immutable record: matching scoped
IDs must have identical remaining fields. Assume UID, pool IDs and item IDs also
remain stable. Store roll identity as `(game, UID, server, id)` and compare full
preserved record contents. Identical records are duplicates. A reused scoped roll
ID with different contents, including changed item/pool IDs or labels, aborts the
whole import. The future UI must explain the conflict without exposing source
payloads or credentials. Do not overwrite, merge heuristically, retry to reconcile,
or commit unaffected subsets. Automatic reconciliation is deferred unless needed.

Imports normally cover an entire period of history. Within a substantially
overlapping older period, incoming records should largely match stored IDs;
a large collection of unmatched IDs can indicate inconsistent IDs or an earlier
incorrect or skipped import. Timestamp-based comparison of overlapping periods
should detect and flag this anomaly in future. Compare only the same game,
account, server and banner scope with compatible timezone evidence. An isolated
new ID in an older period is not sufficient evidence: it may fill a genuine gap.

This is a niche, low-priority diagnostic deferred beyond the initial import flow.
Its overlap threshold and handling of incomplete prior coverage need design and
synthetic tests when implemented. A detected mismatch should stop the import for
user review, without automatic reconciliation. Timestamps identify the period
being compared, not individual roll identity: legitimate distinct rolls can share
an item and second, so never merge them solely on those fields.

The current service compares exact scoped IDs and accepts previously unseen IDs;
it does not yet detect a suspicious concentration of new IDs in an older period.
Existing tests cover same-ID conflicts and distinct same-second records. The UI
error presentation remains milestone 3 work.

## Account, server and timestamps

For initial acquisition, trust that the supplied auth key selects the intended
account. Do not use the key itself as a database identity. Nonempty sample records
make account identification explicit through `uid`; page `region` supplies server
context. Reuse those fields for the existing service's scoped preview. An empty
list provides no UID: use established session context or show an empty result
without creating an account. Never fabricate a UID or server.

Keep the parser's existing mixed-UID rejection and the service's explicit context
and timezone consistency checks. Formal verification of key-to-account binding,
server labels, account switching and missing/empty-response context is deferred
to the **end of milestone 3**, before that milestone is complete. This deferral
does not permit mixing accounts or disabling existing checks.

Treat `time` as server time and `region_time_zone` as its UTC-hour offset. The
samples provide enough context to adopt that assumption now: valid local time
strings, region and a consistent explicit offset. They do not independently prove
the meaning against a server clock. Preserve the original time plus offset;
never reinterpret using the computer's timezone. Current storage performs no UTC
conversion. Missing offset remains unknown; do not guess from UID or region.

## Pagination and request economy

Accept the five-page cursor tests as sufficient for initial implementation.
The [2026-09-23 comparison](HSR-API-RESEARCH.md#page-parameter-comparison-2026-09-23)
returned identical records with `page=1` throughout and with `page` increasing,
while advancing `end_id` in both runs. Incrementing `page` was unnecessary for
that sampled sequence. A further five-request run omitted `page` and returned
the same 50 unique records, with `data.page="0"` throughout. Cursor advancement
alone therefore worked in this sample. The supplied in-game cache contains
category-`11`, size-5 requests with `page=1,2,3`, starting at `end_id=0` then using
two distinct nonzero cursors. Retain incrementing page numbers to mirror that
observed client convention, while using `end_id` to advance the records. A separate
five-request run incrementing `page` without `end_id` repeated the first ten records
on every request. Page metadata therefore does not establish progress; advancing
the cursor is necessary for the tested recipe.
For each category, keep authentication, language and size fixed; start
with page 1/cursor `0`. Validate each successful response, then compare the number
of records in `list` with the requested `size`:

- Fewer records than requested, including zero: this is the final page for the
  category. Retain any returned records and stop without a follow-up request.
- A full page: advance both page and cursor using the last record ID exactly as
  supplied, then request the next page. This also applies when every record on
  the full page is already stored; duplicate status is not a termination rule.

IDs are opaque: no numeric ordering or timestamp extraction is needed. Missing
or malformed data and API errors abort rather than terminate successfully.
Reject a repeated cursor or a cursor cycle; do not loop or restart.

Assume the user makes no new rolls while an import is running. Handling history
that changes during pagination is deferred; no additional requests or automatic
restarts are required to detect concurrent rolls. Existing duplicate, conflict
and cursor-progress checks remain in place.

Fetch all six known categories sequentially, with no speculative prefetch and
no account probes beyond [auth-key validation](#auth-key-validation). Request
`1000` records per page by default to balance request count with smaller
response batches.
Only explicit user actions start acquisition; no background synchronisation.
Keep finite timeouts, cancellation and request/byte bounds even under the accepted
small-account assumption. Existing parsing/storage limits are 2 MiB per response
and 16 MiB per batch. Exceeding a limit must give an error, never truncate history
or silently commit chunks. The client must enforce bounds while receiving data.

## Errors and completeness

Authentication expiry cannot be predicted. Do not schedule expiry checks or refresh
attempts; the user updates the key when necessary. The user reports that keys
last about 24 hours, so extraction considers only the latest and previous game
versions' caches. This is a stated assumption, not a measured lifetime. An expired cached key produced
this response in the user-authorized 2026-09-24 check:

| Field | Observed value |
| --- | --- |
| HTTP status | `200` |
| `retcode` | `-101` |
| `message` | `"authkey timeout"` |
| `data` | `null` |

Treat `retcode: -101` as an expired-key error: stop acquisition without retrying or
writing history, and prompt the user to supply a refreshed key. HTTP success is
not API success. Classify by the numeric code; the observed message documents the
response but is not a required string match or raw text to display. Other nonzero
codes also stop with a safe code and explanation; do not classify every API error
as expiry. This observation establishes the expired-key response, not an exact
key lifetime or the codes for every other authentication failure.

Assume rate limits will not constrain normal use with few sequential requests.
Nevertheless, a received rate-limit error stops the operation and informs the
user rather than initiating a retry loop. For transient connection/timeouts or
HTTP 5xx only, initial policy is **one retry for the same request**, with a short
bounded delay and **at most two extra attempts across the entire acquisition**.
Never restart already completed pages automatically. No retries for authentication,
other API errors, malformed responses, unsupported data or identity conflicts.
If retry fails or its budget is exhausted, report the failure and leave stored
history unchanged. Client implementation and mocked retry tests belong to milestone 3.

Accept complete retained history and manageable per-account volume as product
assumptions. Fetch all pages for all known categories, preserve previously
stored rolls, and never delete old rolls merely because a later response omits
them. A completed fetch means the assumed retained history for the selected scope
has been retrieved. This does not turn sample evidence into a verified lifetime
retention guarantee, or fill gaps from cancelled/failed acquisitions. No separate
retention research or unbounded-volume architecture blocks milestone 2.

## Implementation boundary and acceptance

Milestone 2's contract task is complete under these explicitly accepted assumptions.
The existing parser and transactional services remain unchanged. Milestone 3 must
implement the single-endpoint client, auth-key validation, bounded
retry/pagination policy, context resolution and actionable failure UI with
synthetic TDD and the existing full coverage gates. The initial contract review used saved
responses; subsequent user-authorized page-parameter comparisons and the
expired-key check are documented in research. The contract's initial decisions
are settled; acquisition and user-visible error handling remain to be implemented.
