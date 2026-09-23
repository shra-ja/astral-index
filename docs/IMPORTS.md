# Import design and research

## Source status

A pure Rust HSR API response parser is implemented and tested with synthetic
pages. Native SQLite preview/transactional import services now preserve validated
HSR histories locally. No user-facing importer or acquisition client exists yet. HSR research established
cache-based request extraction and API retrieval: the inspected cache supplies
authentication/request context, and history is fetched from HoYoverse. Acquisition
is now in scope only upon an explicit user request; see
[decision 0002](decisions/0002-user-requested-history-acquisition.md).
The [documented acquisition flow](HSR-API-RESEARCH.md) is not an implemented importer.
Do not assume other local sources contain complete history or promise recovery
of records that the API no longer provides.

| Game | User-provided files | Installation source |
| --- | --- | --- |
| Genshin Impact | Planned; format and version to verify | Research required per OS/version |
| Honkai: Star Rail | Synthetic API response parser implemented; current global compatibility still to verify | Cache URL extraction researched; nine-field query retrieved records in authorized tests; five-page cursor pagination verified on one sample; edge cases/completeness unverified; see [flow](HSR-API-RESEARCH.md) |

Implementation order: HSR API response parsing and transactional services in
milestone 2, user-requested API import in milestone 3, then standalone history-
file imports and additional game sources in milestone 4. Cache selection for
authentication is part of API acquisition, not history-file import.

## Adapter contract

Each adapter should describe supported format versions, detection evidence,
required account/server context, record identity, timestamp semantics, ordering,
banner mapping, and known history limitations. Detection must reject ambiguous
formats rather than selecting an adapter merely because a filename matches.

Pipeline:

1. Read an explicitly chosen file or supported local source with size limits.
   For API acquisition, extract request context and fetch bounded responses from
   HoYoverse only on user request; support cancellation and actionable network/
   authentication errors. Both file data and fetched data enter validation below.
2. Detect game/format/version and request missing account context when necessary.
3. Parse and validate without changing persistent history.
4. Normalize records while preserving identity, ordering, and time uncertainty.
5. Produce a preview: valid, duplicate, conflicting, and rejected counts with
   useful record-level diagnostics that omit private payloads.
6. Commit the reviewed records in a single transaction and record provenance.
7. Return a summary and refresh history/statistics from stored records.

Default to blocking commit on invalid records. If partial import is introduced,
make skipped records explicit and require a deliberate choice in the import UI.
Cancellation or failure must not leave a partially committed batch.

## Research checklist for each source

- Identify official or format-owner documentation, source version, and research date.
- Establish whether data is actually local or requires a remote request.
- Verify path discovery and file access on each claimed OS; support manual selection.
- Document available fields, history limits, timezone, server, and ordering semantics.
- Confirm IDs remain stable across overlapping exports and banner categories.
- Create synthetic fixtures for valid, empty, malformed, duplicate, overlapping,
  out-of-order, and conflicting histories; include multiple accounts and servers.
- Define unknown-version handling and prove errors cannot corrupt existing data.

Never commit source credentials, token-bearing URLs, real logs, or player histories.
Fixtures must state whether they model an external format or an internal proposal;
a synthetic example alone does not establish external compatibility.
