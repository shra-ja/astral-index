---
name: uigf
description: Design, implement, or review UIGF v4.2 roll storage, import, export, and migration, including record and item IDs, game-specific banner enums, and timezone preservation.
---

# UIGF roll data

Use UIGF v4.2 as the roll-data contract when requested, including Roll Tracker's local storage. Read [fields and enums](references/format.md) before writing serializers or validators; read [storage and interoperability](references/storage.md) for persistence, merging, migration, and item dictionaries.

The references target [UIGF v4.2](https://uigf.org/en/standards/uigf.html), checked 2026-09-21. Distinguish upstream requirements from application policy. Verify primary sources when updating versions or interpreting undocumented banner rules. Ordinary local imports must not fetch schemas, dictionaries, or history.

## Workflow

1. Identify input version and game sections before decoding. Use separate legacy adapters for UIGF <=3.0 and SRGF 1.0; changing a version label is not migration.
2. Preserve the UIGF hierarchy, source field types, IDs, and timestamp text. Separate interchange fields from derived indexes, display labels, and application metadata.
3. Validate the selected dataset before writing. Distinguish invalid structure, unsupported versions/games, unknown catalog items, and conflicting records.
4. Merge transactionally using identity scoped to game/account/server. Export the actual supported version and validate serialized output locally.
5. Test synthetic round trips, long IDs, same-second rolls, overlapping imports, account isolation, optional fields, banner distinctions, timezone handling, and rollback.

## Decision guards

- Keep IDs as strings end to end; never pass record IDs through JavaScript Number or floating-point storage.
- Preserve raw banner category separately from concrete pool identity and pity grouping.
- Preserve source-local time; device timezone must not reinterpret it. UTC is a separate derived value with explicit offset evidence.
- UIGF does not establish complete history or define a complete application backup. Store provenance, server evidence, conflicts, and uncertainty separately.
- Enum values do not define pity thresholds or guarantees; verify game rules independently.
- The published Miliastra schema has an array/object keyword inconsistency; consult the reference before claiming support.

For Roll Tracker, use Rust for authoritative parsing, validation, and transactions. Initially implement Genshin and Star Rail; reference coverage of other games is not a feature commitment. Keep stored-history operations local; HoYoverse acquisition is a separate layer invoked only on explicit user action. Follow the repository's TDD and coverage workflow when implementing behavior. This skill itself supplies documentation, not working importers.
