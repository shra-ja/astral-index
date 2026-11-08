# Imports

Status: partially implemented. The Honkai: Star Rail API adapter follows this
contract end to end. History files are read by `uigf::read` and imported through
the [desktop commands](desktop-commands.md) `choose_history_file`,
`read_history_file` and `preview_file_account`, from the Import screen; the
Genshin Impact adapter is still to come. To research a new game or source, see [GAMES](../games/GAMES.md).

## Adapter contract

Each game adapter is concrete; there is no general plugin framework. An adapter
describes its supported format versions, detection evidence, required account and
server context, record identity, timestamp semantics, ordering, banner mapping and
known history limitations. Detection rejects ambiguous formats rather than
choosing an adapter because a file name matches. A source without a server
takes it from its game's UID rule, a function in the game's module such as
`hsr::server_of`, which gives the server and its offset or why a UID has none
([decision 0032](decisions/0032-history-file-import-rules.md)). Pity and guarantee rules also
belong to the adapter ([statistics](statistics.md)).

## Pipeline

Every source, fetched or file, enters the same pipeline:

1. **Read** an explicitly chosen file or supported local source within size
   limits, or, for API acquisition, extract request context and fetch bounded
   responses on user request ([acquisition](acquisition.md)).
2. **Detect** the game, format and version, and ask for missing account context
   when necessary.
3. **Parse and validate** without changing stored history.
4. **Normalize** records, preserving identity, ordering and time uncertainty.
5. **Preview:** new, duplicate, conflicting and rejected counts, with useful
   record-level diagnostics that omit private payloads.
6. **Commit** the reviewed records in one transaction, with provenance
   ([storage](storage.md)).
7. **Return** a summary; screens refresh from stored records.

Invalid records block the commit. If partial import is ever introduced, skipped
records must be explicit and need a deliberate choice in the UI. Cancellation or
failure never leaves a partial batch.

## Rules

- Files are untrusted input: bound their size, validate their format, and keep
  source content out of errors and logs. Render imported names as text.
- Never assume a local file holds complete history, or promise to recover records
  the source no longer provides.
- Never deduplicate by timestamp or localized name; identity is the source ID
  within its game, account and server, and history files compare a roll's facts
  ([decision 0032](decisions/0032-history-file-import-rules.md)). Identical-looking rolls can be
  legitimate, so ambiguous matches need reconciliation, not silent removal.
- Fixtures are synthetic and say whether they model an external format or an
  internal proposal; a synthetic example alone never establishes compatibility.
