# Storage and interoperability

## Recommended Astral Index design

Use UIGF v4.2 as the durable roll-data contract. JSON files or database tables can implement it; UIGF does not select an engine. Keep a database schema version separate from interchange `info.version`. Persistence library selection remains an implementation decision.

Preserve all supported source fields alongside derived indexes. Store application-only server evidence, import provenance, coverage gaps, conflicts, and migration state in companion tables or a separately versioned backup envelope. Plain UIGF export cannot fully back up those extras.

Recommended identity is `(game, account UID, resolved server, source record ID)`. This is application policy, not a schema uniqueness declaration. Resolve ambiguous server evidence before merging. Identical reimports must not inflate counts; conflicting payloads for one identity require reconciliation. Same-time/item/banner records with different IDs remain distinct.

Treat IDs as opaque strings. The synthetic ID `"9007199254740993"` reveals JavaScript Number precision loss. Do not trim leading zeros, infer timestamps from ID digits, assume global uniqueness, or fabricate source IDs from timestamps. If an adapter needs numeric ordering, compare losslessly while retaining original text; lexicographic order differs for unequal lengths.

Scope item IDs to their game; names are localized display data. Preserve unknown catalog IDs and display an unresolved label. Concrete `gacha_id`, category `gacha_type`, and roll `id` are different identities.

## Local import/export

1. Bound input size, detect version and selected game sections, and decode without coercing invalid types.
2. Validate against a pinned local draft-2020-12 schema, then apply semantic checks. Disable remote schema resolution. Account for the Miliastra defect in [fields and enums](format.md).
3. Preview records, duplicates, conflicts, unsupported sections, and errors. Do not claim complete historical coverage.
4. Commit the validated dataset atomically with provenance. Failures and cancellation leave stored history intact.
5. Export selected games/accounts with current producer metadata and correct field types. Validate output and replace files atomically. Deterministic ordering is application policy.

Reject unsupported future versions/enums with useful diagnostics, or preserve them in an explicitly designed staging path. Never silently discard rolls or relabel an unsupported version as v4.2.

## Legacy conversion and certification

[UIGF 4.2](https://uigf.org/en/standards/uigf.html) uses a different layout from [UIGF <=3.0](https://uigf.org/en/standards/uigf-legacy-v3.0.html) and [SRGF 1.0](https://uigf.org/en/standards/srgf.html). Legacy formats have root `info` and `list`; use separate decoders and move account metadata into the proper per-game account entry. Check the source version before mapping fields such as `uigf_version`, `srgf_version`, and `region_time_zone`. Missing required evidence must not be invented.

Legacy Genshin guidance includes synthesizing missing record IDs and inferring timezone from UID. Do not assume those IDs are authoritative API IDs or those offsets are independently observed. Preserve provenance during migration and avoid merging synthetic identities with real records without a tested reconciliation policy.

UIGF 4.0 unified games/accounts and added ZZZ; 4.1 expanded Star Rail categories; 4.2 added Miliastra. Test supported versions explicitly. Certification requires import and export for each claimed game, and the standard requests an in-app link declaring UIGF support. Schema validation alone is not certification.

## Item dictionary namespaces

The [UIGF API](https://uigf.org/en/api.html) documents dictionaries for Genshin and Star Rail. API game keys `genshin`/`starrail` differ from archive `hk4e`/`hkrpg`.

| Archive language | API dictionary language |
| --- | --- |
| `zh-cn`, `zh-tw` | `chs`, `cht` |
| `ja-jp`, `ko-kr` | `jp`, `kr` |
| `de-de`, `en-us`, `es-es`, `fr-fr` | `de`, `en`, `es`, `fr` |
| `id-id`, `pt-pt`, `ru-ru` | `id`, `pt`, `ru` |
| `th-th`, `vi-vn` | `th`, `vi` |

The page does not list Italian/Turkish equivalents. Dictionary URL: `https://api.uigf.org/dict/{game}/{lang}.json`; `all` and `md5` are special values. Bundle a versioned, license-reviewed dictionary for local operation. Convert numeric dictionary IDs losslessly to archive strings.

Translation uses `normal` for name-to-ID and `reverse` for ID-to-name. Batch misses may return 0 or an empty name; treat these as unresolved, and check result lengths. Identification is not a dependable substitute for a known game/language dictionary. These services must not become hidden runtime dependencies.

## Future implementation checks

Test multi-game/account round trips; optional absence; every accepted enum; 19-digit IDs and the precision-boundary example; same-second distinct rolls; repeated/overlapping imports; cross-account/game/server isolation; conflicting identities; original timestamps under different device timezones; unknown items; unsupported sections; malformed/oversized input; and rollback. Verify separate full backups preserve application metadata beyond UIGF.
