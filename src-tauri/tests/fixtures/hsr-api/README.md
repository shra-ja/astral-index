# Synthetic HSR API responses

These invented records model the documented API envelope, not UIGF archives or
captured player data. See [research and limits](../../../../docs/games/hsr/api-research.md).

- `page.json`: two distinct long IDs at the same second, one fictional account,
  explicit fictional server and offset, and unknown catalog identifiers.
- `empty.json`: successful empty list with no account or timezone evidence.
- `error.json`: nonzero API result with a synthetic message that must not escape
  into diagnostics; null data is not a successful empty page.

The unit tests in `src-tauri/src/hsr.rs` derive malformed, oversized,
mixed-account, unsupported-banner, invalid-date and duplicate variants in memory,
and a scripted mock there supplies overlapping pages followed by an empty success
or an API failure. Client pagination is tested separately against scripted
transports in `src-tauri/src/acquisition/`. No test makes live history requests,
uses credentials or reads private local data.
