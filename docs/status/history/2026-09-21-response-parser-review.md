# 2026-09-21: response parser and review (archived 2026-10-04)

Archived from living docs. Statements and “Next” items below describe their
historical context, not current priorities.

## From TESTING.md

### HSR response foundation TDD

On `feat/hsr-response-foundations`, the first seven integration tests failed
against a compiling parser placeholder returning `InvalidResponse`: valid pages,
empty pages, API codes, validation categories and size bounds were absent.
The parser implementation made all seven pass. Two additional tests then failed
on discarded unknown fields and an API error without `data`; preserving page/roll
extras and defaulting absent envelope data made both pass. A scripted mock source
adds overlap and terminal-success/error scenarios, for ten passing Rust tests.
A preliminary missing serialization-trait compile error was corrected before
observing the unknown-field assertion failure; it is not counted as red evidence.

Run `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test hsr`
for focused tests. `npm run check` runs these under LLVM instrumentation alongside
native startup and unchanged coverage failure probes. Fixtures and mocks have
no credentials or network access. They test parser policy, not live compatibility,
HTTP transport, automatic cursor progression, persistence, or complete history.

## From api-research.md

### Translation into the application later

The requested future flow is: automatically discover and read `data_2` (or read
a user-provided fallback file) → extract candidate URLs locally → acquire history
from HoYoverse on user request → validate/normalize
responses → use the shared preview and transactional import pipeline. Keep the
Rust source reader and URL extractor separate from the future network client;
file import, stored-history browsing, analysis, and export remain local.
User-requested acquisition is an accepted product requirement, replacing the
assumption that cache files suffice for offline acquisition; see
[decision 0002](../../decisions/0002-user-requested-history-acquisition.md). No API
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

### Response foundation review (2026-09-21)

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
