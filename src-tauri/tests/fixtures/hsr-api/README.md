# Synthetic HSR API responses

These invented records model the documented API envelope, not UIGF archives or
captured player data. See [research and limits](../../../../docs/games/hsr/api-research.md).

- `page.json`: two distinct long IDs at the same second, one fictional account,
  explicit fictional server and offset, and unknown catalog identifiers.
- `empty.json`: successful empty list with no account or timezone evidence.
- `error.json`: nonzero API result with a synthetic message that must not escape
  into diagnostics; null data is not a successful empty page.

the unit-test module in `src-tauri/src/hsr.rs` derives malformed, oversized, mixed-account, unsupported-banner,
invalid-date and duplicate variants in memory. All tests run without live history
requests, credentials, or access to private local-data files.

The scripted mock in the unit-test module in `src-tauri/src/hsr.rs` checks expected page/cursor request metadata
and supplies overlapping pages followed by empty success or API failure. It is a
parser-boundary fixture source; HTTP/client pagination tests remain future work.
